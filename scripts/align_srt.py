#!/usr/bin/env python3
"""
按音频给 md 文稿打 SRT 字幕时间轴：字幕文字取文稿，时间取语音识别。

文稿是整理过的书面稿，口语里的语气词、重复、口头禅删掉了，个别词句也有润色，
与录音并非逐字对应，所以不做强制对齐，而是：
  1. FunASR paraformer-zh 识别音频得到逐字时间戳，优先用 Intel 核显（torch XPU），
     结果缓存到 subtitles/asr/<音频名>.json
  2. 文稿与识别结果都转无调拼音，并归并模糊音（z/zh、n/l、前后鼻音），按拼音做编辑距离对齐
  3. 连续对上的字作锚点；锚点之间没对上的字（润色改写、删掉口头禅处），按这一段识别字的
     发声时长等比摊开，不把停顿摊进去；这一段没有识别字时贴近前后锚点
  4. 录音与文稿顺序不同的句子（如两个问题连着念完再分别回答），到整段录音里找最像的一处挪过去
  5. 按文稿标点切成字幕条，过长的在分词边界上按停顿拆开

文稿取法：md 中每个 <SectionAudio src=".../xxx.m4a" />，从它往下到下一个 SectionAudio、
或级别不低于其所在标题的下一个标题，就是这段音频的正文；音频按文件名到 --audio-dir 下找。
同一标题下卡片连着放、正文跟在最后一张后面时，这几段音频共用正文；隔了标题还等不到正文的卡片
是真没有文稿，跳过。

环境：torch（Intel 核显装 XPU 版）funasr pypinyin rapidfuzz jieba，ffmpeg 在 PATH 中
用法：
  python scripts/align_srt.py refs/qxgs/fudao/qxgsfd-09ptx.md --audio-dir "D:/前行第05册91-113" --only 第94课_答疑
  python scripts/align_srt.py refs/qxgs/fudao/qxgsfd-09ptx.md --audio-dir "D:/前行第05册91-113"
输出（subtitles/ 不入库）：
  subtitles/asr/<音频名>.json            识别结果缓存，改了对齐逻辑重跑时不再识别
  subtitles/asr/<音频名>.srt             识别原文字幕（对照用）
  subtitles/srt/<md名>/<音频名>.srt      文稿文字 + 对齐时间
  subtitles/srt/<md名>/report/<音频名>.report.txt 匹配率、挪位的句子、低匹配字幕条、出入较大处（--homophones 另列同音异字）
"""

import argparse, bisect, json, os, re, subprocess, time
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import unquote

import jieba
import numpy as np
from pypinyin import lazy_pinyin
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

ROOT = Path(__file__).resolve().parent.parent
ASR_DIR = ROOT / "subtitles" / "asr"
SRT_DIR = ROOT / "subtitles" / "srt"

SR = 16000
XPU_MEM_GB = 8     # PyTorch 在核显上最多占用的内存
CLAUSE_PUNCT = "，。！？；：、…"
CLOSE_PUNCT = "”’」』）》"
STRIP_TAIL = "，。、；：…—"
MAX_LINE = 20      # 一条字幕最多字数，超过按停顿最长处拆
MIN_LINE = 6       # 字数少于此、或显示短于 MIN_DUR 毫秒，且与下一条间隔很近时合并
MIN_DUR = 1200
READ_MS = 120      # 补足一闪而过的字幕时，每字所需显示时长
MIN_SHOW, MAX_SHOW = 1000, 2500
CHUNK_S = 1800     # 分块识别，每块秒数
JOIN_GAP = 2000    # 几段音频共用正文时，拼接处留的间隔（毫秒）
UNREAD = 0.3       # --drop-unread：锚点比例低于此的整行视为没有朗读
UNREAD_FIND = 6    # 至少这么多字的行才到整段录音里复查，太短容易碰巧相似
MERGE_MAX = 16     # 合并后最多字数
LOW_MATCH = 0.5    # 锚点比例低于此的字幕条进报告
CHAR_MS = 250      # 没有识别字可参照时，每字的估计时长
LONG_CUE = 8000    # 超过此时长且远超字数所需的字幕条收短
DIFF_REPORT = 8    # 文稿连续这么多字对不上、或录音里连续 DIFF_HEARD 字文稿里没有的地方进报告
DIFF_HEARD = 30
MOVE_MIN = 8       # 挪位：至少这么多字的句子才考虑
MOVE_SCORE = 80    # 别处的拼音相似度至少这么高，且比原位置的锚点比例高出 MOVE_GAIN 才挪
MOVE_GAIN = 25

# 片段开头的「问：」「答：」与段尾的「（生西法师）」不朗读
LABEL = re.compile(r"^(?:问|答)[：:]")
ATTRIB = re.compile(r"（[^（）]{1,8}(?:法师|堪布|上师|仁波切|喇嘛)）")
SKIP_LINE = re.compile(r"^(?:本稿为内部学习所用|import\s|\[\^[^\]]*\]:|\[\d+\]|(?:[-*+]\s+)?\[[^\]]*\]\([^)]*\)\s*$)")
FOOTNOTE_RULE = re.compile(r"^-{10,}$")  # 段尾脚注区的分隔线，其后都不朗读
FOOTNOTE_REF = re.compile(r"\[\\\[[^\]]*\\\]\](?:\([^)]*\))?")  # 网页转来的脚注标记 [\[1\]](http://...)，也有不带链接的
FOOTNOTE_BODY = re.compile(r"^\[\\\[[^\]]*\\\]\](?:\([^)]*_ftnref[^)]*\)|(?:\([^)]*\))?\s)")  # 同上，指回正文或行首标记后跟空格的是脚注内容（链接可能被截断）
ANSWER_HEAD = re.compile(r"^第.{1,3}品\s*思考题答案$")  # 文末附的思考题答案，不朗读

HEADING = re.compile(r"^(#{1,6})\s+(.*)$", re.M)
LESSON_HEAD = re.compile(r"\d+节?课")
AUDIO_TAG = re.compile(r"<SectionAudio\b(.*?)/>", re.S)
TOKEN_RUN = re.compile(r"[0-9０-９A-Za-zＡ-Ｚａ-ｚ\u3400-\u9fff\uf900-\ufaff]+")
DIGITS = re.compile(r"[0-9０-９]+|.", re.S)
SENT_END = re.compile(rf"[。！？][{CLOSE_PUNCT}]*$")
CN_DIGIT = "零一二三四五六七八九"
WIDE = str.maketrans("０１２３４５６７８９", "0123456789")

jieba.setLogLevel(60)


# ---------- 文稿 ----------

def sections(md_path, stop_at_heading=False):
    """md 中每个 SectionAudio 对应的 (音频文件名, 标题, 正文)。
    stop_at_heading：正文到下一个同级或更高级标题为止，其后没有音频的章节不算本段。"""
    md = md_path.read_text("utf-8")
    heads = [(m.start(), len(m.group(1)), m.group(2).strip()) for m in HEADING.finditer(md)]
    tags = list(AUDIO_TAG.finditer(md))
    out = []
    for n, m in enumerate(tags):
        src = re.search(r'\bsrc="([^"]+)"', m.group(1))
        if not src:
            continue
        name = unquote(src.group(1).rsplit("/", 1)[-1])
        above = [h for h in heads if h[0] < m.start()]
        level, title = (above[-1][1], above[-1][2]) if above else (0, name)
        # 正文到下一段音频所属的标题为止（紧贴音频卡片的标题才算），中间的同级小标题（如科判）仍算本段
        end = tags[n + 1].start() if n + 1 < len(tags) else len(md)
        owner = [h[0] for h in heads if m.end() < h[0] < end]
        stop = owner[-1] if owner and n + 1 < len(tags) and not md[owner[-1]:end].partition("\n")[2].strip() else end
        if stop_at_heading:
            stop = next((h[0] for h in heads if m.end() < h[0] < stop and h[1] <= level), stop)
        # 没有音频的课或答疑（如只有文稿）不算本段
        other = [h[0] for h in heads if m.end() < h[0] < stop and LESSON_HEAD.search(h[2]) and not stop_at_heading]
        out.append((name, title, clean(md[m.end():other[0] if other else stop])))
    return out


def audio_groups(secs):
    """几段音频共用一份正文（同一标题下卡片连着放、正文跟在最后一张后面）时归成一组：[([音频文件名], 标题, 正文)]。
    隔了标题还等不到正文的卡片是真没有文稿，不并进下一节。title 等于 name 表示卡片上方还没有标题。"""
    out, names, owner = [], [], None
    for name, title, text in secs:
        if names and title not in (owner, name):
            print(f"跳过（没有正文）{'、'.join(names)}")
            names = []
        names.append(name)
        owner = title
        if text.strip():
            out.append((names, title, text))
            names = []
    if names:
        print(f"跳过（没有正文）{'、'.join(names)}")
    return out


def clean(body):
    """去掉 md 标记、问答标签、说话人署名，按段落换行。"""
    lines = []
    for line in body.splitlines():
        line = line.strip()
        if FOOTNOTE_RULE.match(line) or ANSWER_HEAD.match(line):
            break
        if not line or SKIP_LINE.match(line) or FOOTNOTE_BODY.match(line):
            continue
        line = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", line)
        line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)
        line = re.sub(r"\[\d+\]|\[\^[^\]]*\]|<[^>]+>", "", line)
        line = re.sub(r"^(?:#{1,6}\s+|>\s*|[-*+]\s+)", "", line)
        line = line.replace("**", "").replace("__", "")
        line = FOOTNOTE_REF.sub("", line)  # 放在去粗体之后：标记可能被拆成 **[**\[2\]**]**
        line = LABEL.sub("", ATTRIB.sub("", line)).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


# ---------- 读音 ----------

def read_number(s, next_ch):
    """阿拉伯数字串的中文读法：年份、长串逐位读，其余按数值读。"""
    if len(s) > 4 or s.startswith("0") and len(s) > 1 or next_ch == "年":
        return "".join(CN_DIGIT[int(c)] for c in s)
    out, zero = "", False
    for i, c in enumerate(s):
        d = int(c)
        if d == 0:
            zero = True
            continue
        if zero and out:
            out += "零"
        zero = False
        out += CN_DIGIT[d] + ("", "十", "百", "千")[len(s) - 1 - i]
    return (out[1:] if out.startswith("一十") else out) or "零"


def fuzzy(py):
    """归并口音中容易混的音：平翘舌、n/l、前后鼻音。"""
    py = re.sub(r"^([zcs])h", r"\1", py)
    py = re.sub(r"^n(?!g)", "l", py)
    return re.sub(r"([aei])ng$", r"\1n", py)


def pinyin(chars):
    py = lazy_pinyin("".join(chars), errors=lambda s: list(s.lower()))
    if len(py) != len(chars):
        raise ValueError(f"拼音转换后字数不一致：{''.join(chars)}")
    return [fuzzy(p) for p in py]


def ref_units(text):
    """文稿展开成读音单位 [(字位置, 拼音)]：汉字、字母各一个，数字串换成中文读法后摊到各位数字上。"""
    units = []
    for run in TOKEN_RUN.finditer(text):
        pos, chars = [], []
        for m in DIGITS.finditer(run.group()):
            s, p0 = m.group().translate(WIDE), run.start() + m.start()
            if s.isdigit():
                r = read_number(s, text[run.start() + m.end():][:1])
                pos += [p0 + min(len(s) - 1, q * len(s) // len(r)) for q in range(len(r))]
                chars += list(r)
            else:
                pos.append(p0)
                chars.append(s)
        units += zip(pos, pinyin(chars))
    return units


def hyp_units(hyp):
    """识别结果展开成 [(拼音, 起, 止, 识别字)]；连续单字按上下文取多音字读音，数字等多音节词平分时长。"""
    units, run = [], []

    def flush():
        units.extend((p, s, e, t) for p, (t, s, e) in zip(pinyin([t for t, _, _ in run]), run))
        run.clear()

    for t, s, e in hyp:
        if len(t) == 1:
            run.append((t, s, e))
            continue
        flush()
        syl = pinyin(list(read_number(t, ""))) if t.isdigit() else [t.lower()]
        step = (e - s) / len(syl)
        units += [(p, round(s + step * k), round(s + step * (k + 1)), t) for k, p in enumerate(syl)]
    flush()
    return units


# ---------- 识别 ----------

def audio_chunks(path):
    """流式解码，每次给 CHUNK_S 秒，长音频不必整个放进内存。"""
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         stdout=subprocess.PIPE)
    while pcm := p.stdout.read(CHUNK_S * SR * 2):
        yield np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
    if p.wait():
        raise RuntimeError(f"ffmpeg 解码失败：{path}")


def limit_cpu(percent):
    """Windows 上用 Job Object 硬性限制本进程及子进程（ffmpeg）的总 CPU 占用，并调低优先级。"""
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateJobObjectW.restype = wintypes.HANDLE
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    k32.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    job = k32.CreateJobObjectW(None, None)
    info = (wintypes.DWORD * 2)(0x1 | 0x4, int(percent * 100))  # ENABLE | HARD_CAP，单位万分之一
    me = k32.GetCurrentProcess()
    if not (job and k32.SetInformationJobObject(job, 15, info, ctypes.sizeof(info))
            and k32.AssignProcessToJobObject(job, me)):
        raise ctypes.WinError(ctypes.get_last_error())
    k32.SetPriorityClass(me, 0x4000)  # BELOW_NORMAL_PRIORITY_CLASS
    return job


_model = None
_threads = None  # 识别线程数，None 用 funasr 默认

def asr(audio_path, cache, device):
    if cache.exists():
        return json.loads(cache.read_text("utf-8"))
    global _model
    if _model is None:
        import torch
        from funasr import AutoModel
        if device == "auto":
            device = "xpu" if hasattr(torch, "xpu") and torch.xpu.is_available() else "cpu"
        name = torch.xpu.get_device_name(0) if device.startswith("xpu") else "CPU"
        if device.startswith("xpu"):  # 核显与系统共用内存，限制 PyTorch 占用
            torch.xpu.set_per_process_memory_fraction(
                min(XPU_MEM_GB * 2**30 / torch.xpu.get_device_properties(0).total_memory, 1))
        print(f"识别设备：{device}（{name}）", flush=True)
        extra = {"ncpu": _threads} if _threads else {}
        _model = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", device=device,
                           disable_update=True, disable_pbar=True, **extra)
        if _threads:
            torch.set_num_threads(_threads)
    t0, base, data = time.time(), 0, []
    for audio in audio_chunks(audio_path):
        res = _model.generate(input=audio, batch_size_s=300)[0]
        tokens = res["text"].split() if " " in res["text"] else list(res["text"])
        stamps = res.get("timestamp", [])
        if len(tokens) != len(stamps):
            raise ValueError(f"识别字数 {len(tokens)} 与时间戳数 {len(stamps)} 不一致")
        data += [[t, s + base, e + base] for t, (s, e) in zip(tokens, stamps)]
        base += len(audio) * 1000 // SR
    cost = time.time() - t0
    print(f"识别 {base / 60000:.1f} 分钟音频用时 {cost:.1f}s（{base / 1000 / cost:.0f} 倍速）", flush=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    return data


# ---------- 对齐 ----------

def codes(syllables, table):
    """每个拼音音节映射成一个私用区字符，便于用 rapidfuzz 做序列编辑距离。"""
    return "".join(chr(0xE000 + table.setdefault(s, len(table))) for s in syllables)


def anchors(ops):
    """编辑距离的 equal 块里挑可信的作锚点：3 字以上的连续命中，或两侧出入都不大的短命中。
    润色改写处常有零星对上的「的」「是」，单独拿来定时间会把字幕拽偏。"""
    eq = [(i1, i2, j1, j2) for tag, i1, i2, j1, j2 in ops if tag == "equal"]
    keep = []
    for n, (i1, i2, j1, j2) in enumerate(eq):
        prev = eq[n - 1] if n else (0, 0, 0, 0)
        nxt = eq[n + 1] if n + 1 < len(eq) else None
        gap_prev = max(i1 - prev[1], j1 - prev[3])
        gap_next = max(nxt[0] - i2, nxt[2] - j2) if nxt else 0
        if i2 - i1 >= 3 or i2 - i1 >= (max(gap_prev, gap_next) + 1) / 2:
            keep.append((i1, i2, j1, j2))
    return keep


def spread(n, segs):
    """把 n 个字按发声时长等比摊到 segs（[(起, 止)]）上，跳过其间的静音。"""
    durs = [max(e - s, 1) for s, e in segs]
    total = sum(durs)

    def at(x, start):
        for (s, _), d in zip(segs, durs):
            if x < d or (not start and x <= d):
                return s + x
            x -= d
        return segs[-1][1]

    return [(round(at(total * m / n, True)), round(at(total * (m + 1) / n, False))) for m in range(n)]


def squeeze(text, ref, k, j, t0, t1):
    """没有识别字可参照的一段文稿（ref[k:j]）：间隔不长就均分，否则与前锚点同子句的贴前、其余贴后。"""
    n = j - k
    if t0 is None:
        t0 = t1 - CHAR_MS * n
    if t1 is None:
        t1 = t0 + CHAR_MS * n
    step = (t1 - t0) / n
    if step <= CHAR_MS * 1.5:
        return [(round(t0 + step * m), round(t0 + step * (m + 1))) for m in range(n)]
    left = k
    while left < j and not any(c in CLAUSE_PUNCT + "\n" for c in text[ref[left - 1][0] if left else 0:ref[left][0]]):
        left += 1
    return ([(round(t0 + CHAR_MS * m), round(t0 + CHAR_MS * (m + 1))) for m in range(left - k)]
            + [(round(t1 - CHAR_MS * (j - m)), round(t1 - CHAR_MS * (j - m - 1))) for m in range(left, j)])


def align(text, ref, hyp):
    """单调对齐。返回每个读音单位的时间 (起, 止)、作锚点时对上的识别单位下标（否则 None），
    以及文稿与录音出入较大的片段 [(时间, 文稿, 录音)]。"""
    table = {}
    a, b = codes([p for _, p in ref], table), codes([u[0] for u in hyp], table)
    blocks = anchors(Levenshtein.opcodes(a, b))
    times, link = [None] * len(ref), [None] * len(ref)

    def pin(i, h, size):
        for d in range(size):
            times[i + d] = hyp[h + d][1:3]
            link[i + d] = h + d

    def boundary(m):
        """文稿第 m-1 与第 m 个读音单位之间有标点或换行。"""
        return m <= 0 or m >= len(ref) or any(c in CLAUSE_PUNCT + "\n" for c in text[ref[m - 1][0]:ref[m][0]])

    def fill(k, j, h0, h1):
        """填锚点之间的空当 ref[k:j] / hyp[h0:h1]，前后锚点的时间已定。"""
        if k == j:
            return
        if h0 == h1:
            times[k:j] = squeeze(text, ref, k, j, times[k - 1][1] if k else None,
                                 times[j][0] if j < len(ref) else None)
            return
        # 空当里还有连续对上的字（整体对齐时被别处同音字抢走了）：补作锚点，两侧递归
        m = SequenceMatcher(None, a[k:j], b[h0:h1], autojunk=False).find_longest_match()
        if m.size >= 3 or m.size == 2 and min(j - k, h1 - h0) <= 10:
            pin(k + m.a, h0 + m.b, m.size)
            fill(k, k + m.a, h0, h0 + m.b)
            fill(k + m.a + m.size, j, h0 + m.b + m.size, h1)
            return
        # 对不上的字按识别字发声时长等比摊开；录音明显比文稿长（夹着没整理进文稿的话）时，
        # 与前锚点同子句的字贴前、与后锚点同子句的字贴后，不铺满整个空当
        n, H = j - k, h1 - h0
        cuts = [m for m in range(k, j + 1) if boundary(m)]
        lead, tail = (cuts[0] - k, j - cuts[-1]) if cuts else (n, 0)
        wl = min(H, -(-lead * 3 // 2) + 2) if lead else 0
        wr = min(H, -(-tail * 3 // 2) + 2) if tail else 0
        if not cuts or H <= 2 * n + 4 or wl + wr >= H:
            times[k:j] = spread(n, [u[1:3] for u in hyp[h0:h1]])
            return
        if lead:
            times[k:k + lead] = spread(lead, [u[1:3] for u in hyp[h0:h0 + wl]])
        if tail:
            times[j - tail:j] = spread(tail, [u[1:3] for u in hyp[h1 - wr:h1]])
        if n - lead - tail:
            times[k + lead:j - tail] = spread(n - lead - tail, [u[1:3] for u in hyp[h0 + wl:h1 - wr]])

    i0 = j0 = 0
    for i1, i2, j1, j2 in blocks:
        pin(i1, j1, i2 - i1)
    for i1, i2, j1, j2 in blocks + [(len(ref), None, len(hyp), None)]:
        fill(i0, i1, j0, j1)
        i0, j0 = i2, j2

    # 细化之后仍未对上的连续片段：文稿较长一段对不上，或录音里较长一段话文稿里没有
    diffs, last = [], -1
    for k in range(len(ref) + 1):
        if k < len(ref) and link[k] is None:
            continue
        h0 = link[last] + 1 if last >= 0 else 0
        h1 = link[k] if k < len(ref) else len(hyp)
        if k - last - 1 >= DIFF_REPORT or h1 - h0 >= DIFF_HEARD:
            t = hyp[h0][1] if h0 < len(hyp) else hyp[-1][2]
            doc = text[ref[last + 1][0]:ref[k - 1][0] + 1] if k > last + 1 else ""
            diffs.append((t, doc, heard_text(hyp[h0:h1])))
        last = k
    return times, link, diffs


def heard_text(units):
    """识别单位还原成识别原文（多音节词只取一次）。"""
    out = []
    for n, u in enumerate(units):
        if n == 0 or len(u[3]) == 1 or u[3:] != units[n - 1][3:] or u[1] != units[n - 1][2]:
            out.append(u[3])
    return "".join(out)


def sentences(text):
    """按句末标点与换行切句，返回 (起, 止)。"""
    out, start = [], 0
    for m in re.finditer(rf"[。！？][{CLOSE_PUNCT}]*|\n", text):
        if text[start:m.end()].strip():
            out.append((start, m.end()))
        start = m.end()
    if text[start:].strip():
        out.append((start, len(text)))
    return out


def find_moves(text, ref, hyp, times, link):
    """单调对齐只能按文稿顺序走，录音里提前或推后念的句子会被挤到错的位置、只剩零星锚点。
    对锚点偏少的句子到整段录音里找最像的一处：明显更像、不在原位附近、且那里的识别字
    没被别处当锚点用掉，就挪过去。返回 [(句子的读音单位下标, 识别单位区间 h0, h1)]。"""
    table = {}
    hyp_codes = codes([u[0] for u in hyp], table)
    pos = [p for p, _ in ref]
    taken = {j for j in link if j is not None}
    moves = []
    for s, e in sentences(text):
        ks = list(range(bisect.bisect_left(pos, s), bisect.bisect_left(pos, e)))
        if len(ks) < MOVE_MIN:
            continue
        cur = sum(link[k] is not None for k in ks) / len(ks)
        if cur >= 0.8:
            continue
        r = fuzz.partial_ratio_alignment(codes([ref[k][1] for k in ks], table), hyp_codes)
        if r is None or r.score < max(MOVE_SCORE, cur * 100 + MOVE_GAIN):
            continue
        h0, h1 = r.dest_start, r.dest_end
        if sum(j in taken for j in range(h0, h1)) > 0.3 * (h1 - h0):
            continue
        if hyp[h0][1] < times[ks[-1]][1] + 3000 and hyp[h1 - 1][2] > times[ks[0]][0] - 3000:
            continue
        # 紧贴着的零星识别字（「啊」之类）一并带走，免得留在原处被摊给前后的句子
        for _ in range(3):
            if h0 and h0 - 1 not in taken and hyp[h0][1] - hyp[h0 - 1][2] < 300:
                h0 -= 1
            if h1 < len(hyp) and h1 not in taken and hyp[h1][1] - hyp[h1 - 1][2] < 300:
                h1 += 1
        moves.append((ks, h0, h1))
        taken.update(range(h0, h1))
    return moves


def split_unread(text, ref, link, hyp):
    """按文稿逐字朗读的音频（如有声书）：整行对不上的是没读的内容（藏文音译、图注等），
    从文稿里拿掉，免得占用前后的时间。没读的行多时，读了的行也可能被挤得对不上，
    所以再到整段录音里找一遍，找得到的留下。返回 (留下的文稿, 拿掉的行)。"""
    table = {}
    hyp_codes = codes([u[0] for u in hyp], table)
    pos = [p for p, _ in ref]
    keep, drop, start = [], [], 0
    for line in text.split("\n"):
        i, j = bisect.bisect_left(pos, start), bisect.bisect_left(pos, start + len(line))
        start += len(line) + 1
        if line.startswith("藏音") or j > i and sum(link[k] is not None for k in range(i, j)) / (j - i) < UNREAD and not (
                j - i >= UNREAD_FIND and fuzz.partial_ratio(codes([p for _, p in ref[i:j]], table), hyp_codes) >= MOVE_SCORE):
            drop.append(line)
        else:
            keep.append(line)
    return "\n".join(keep), drop


def align_all(text, ref, hyp):
    """先整体单调对齐，再把顺序不同的句子挪到录音里的实际位置，其余部分去掉这些句子后重新对齐。"""
    times, link, diffs = align(text, ref, hyp)
    moves = find_moves(text, ref, hyp, times, link)
    if not moves:
        return times, link, diffs, []
    moved_k = {k for ks, _, _ in moves for k in ks}
    moved_h = {j for _, h0, h1 in moves for j in range(h0, h1)}
    rest_k = [k for k in range(len(ref)) if k not in moved_k]
    rest_h = [j for j in range(len(hyp)) if j not in moved_h]
    t, l, diffs = align(text, [ref[k] for k in rest_k], [hyp[j] for j in rest_h])
    for n, k in enumerate(rest_k):
        times[k], link[k] = t[n], rest_h[l[n]] if l[n] is not None else None
    notes = []
    for ks, h0, h1 in moves:
        a0, a1 = max(0, h0 - 3), min(len(hyp), h1 + 3)
        t, l, _ = align(text, [ref[k] for k in ks], hyp[a0:a1])
        for n, k in enumerate(ks):
            times[k], link[k] = t[n], a0 + l[n] if l[n] is not None else None
        notes.append((times[ks[0]][0], text[ref[ks[0]][0]:ref[ks[-1]][0] + 1]))
    return times, link, diffs, sorted(notes)


# ---------- 切分 ----------

def clauses(text):
    """按标点切成子句，返回 (起, 止, 段落号) 字符区间，止包含句尾标点。"""
    out, start, para = [], 0, 0
    for i, ch in enumerate(text):
        if ch == "\n":
            if i > start:
                out.append((start, i, para))
            start, para = i + 1, para + 1
        elif ch in CLAUSE_PUNCT:
            j = i + 1
            while j < len(text) and text[j] in CLAUSE_PUNCT + CLOSE_PUNCT:
                j += 1
            if j > start:
                out.append((start, j, para))
            start = j
    if start < len(text):
        out.append((start, len(text), para))
    return [(s, e, p) for s, e, p in out if text[s:e].strip()]


def word_starts(text):
    """分词后每个词的起始位置，长句只在这些位置拆，免得把一个词拆到两条字幕里。"""
    starts, p = set(), 0
    for w in jieba.cut(text, HMM=False):
        starts.add(p)
        p += len(w)
    return starts


def build_cues(text, ref, times, hit):
    by_pos = {}
    for k, (p, _) in enumerate(ref):
        by_pos.setdefault(p, []).append(k)
    starts = word_starts(text)
    cues = []

    def emit(ks, s, e, para):
        if ks:
            cues.append({"text": text[s:e].strip(), "ks": ks, "para": para})

    for s, e, para in clauses(text):
        ks = [k for p in range(s, e) for k in by_pos.get(p, [])]
        stack = [(s, e, ks)]
        while stack:
            s0, e0, ks0 = stack.pop(0)
            if len(ks0) <= MAX_LINE:
                emit(ks0, s0, e0, para)
                continue
            # 太长：在中间一半范围内的词边界上，取停顿最长处拆；停顿差不多时取靠中间的
            lo, hi = len(ks0) // 4, len(ks0) - len(ks0) // 4
            cands = [m for m in range(lo, hi) if ref[ks0[m]][0] != ref[ks0[m - 1]][0]]
            cands = [m for m in cands if ref[ks0[m]][0] in starts] or cands or [len(ks0) // 2]
            cut = max(cands, key=lambda m: (min(times[ks0[m]][0] - times[ks0[m - 1]][1], 1000) // 100,
                                            -abs(m - len(ks0) / 2)))
            mid = ref[ks0[cut]][0]
            stack[:0] = [(s0, mid, ks0[:cut]), (mid, e0, ks0[cut:])]

    def dur(c):
        return times[c["ks"][-1]][1] - times[c["ks"][0]][0]

    def short(c):
        return len(c["ks"]) < MIN_LINE or dur(c) < MIN_DUR

    # 一个锚点都没有、又显示不到 MIN_DUR 的子句（录音里语序不同、或整理时添加的话），单独显示只会
    # 一闪而过：句子没完就并入同段落的下一条，否则并入上一条，时间跟随那一条
    kept = []
    for n, c in enumerate(cues):
        if not any(hit[k] for k in c["ks"]) and dur(c) < MIN_DUR:
            nxt = cues[n + 1] if n + 1 < len(cues) else None
            prv = kept[-1] if kept else None
            if (nxt and nxt["para"] == c["para"] and not SENT_END.search(c["text"])
                    and len(c["ks"]) + len(nxt["ks"]) <= MAX_LINE):
                t = times[nxt["ks"][0]][0]
                for k in c["ks"]:
                    times[k] = (t, t)
                nxt["text"], nxt["ks"] = c["text"] + nxt["text"], c["ks"] + nxt["ks"]
                continue
            if prv and prv["para"] == c["para"] and len(prv["ks"]) + len(c["ks"]) <= MAX_LINE:
                t = times[prv["ks"][-1]][1]
                for k in c["ks"]:
                    times[k] = (t, t)
                prv["text"], prv["ks"] = prv["text"] + c["text"], prv["ks"] + c["ks"]
                continue
        kept.append(c)
    cues = kept

    # 字数少或显示太短的子句与紧邻的下一条合并；不跨段落、不跨句末，挪过位的句子前后时间不连续也不合并
    merged = []
    for c in cues:
        if merged:
            p = merged[-1]
            gap = times[c["ks"][0]][0] - times[p["ks"][-1]][1]
            if (p["para"] == c["para"] and not SENT_END.search(p["text"]) and (short(p) or short(c))
                    and len(p["ks"]) + len(c["ks"]) <= MERGE_MAX and -50 < gap < 300):
                p["text"] += c["text"]
                p["ks"] += c["ks"]
                continue
        merged.append(c)

    for c in merged:
        c["start"] = times[c["ks"][0]][0]
        c["end"] = max(times[c["ks"][-1]][1], c["start"] + 200)
        c["match"] = sum(hit[k] for k in c["ks"]) / len(c["ks"])
        c["text"] = c["text"].rstrip(STRIP_TAIL) or c["text"]
        # 显示时长远超字数所需：录音里那段多是整理时删掉的发挥。收到正常语速的长度，
        # 放在本条锚点字所在处；没有锚点就贴着下一条（删掉的多是这句之前的铺垫）
        need = max(MIN_DUR, len(c["ks"]) * CHAR_MS * 2)
        if c["end"] - c["start"] > max(LONG_CUE, need * 2):
            got = [times[k] for k in c["ks"] if hit[k]]
            if got:
                mid = (got[0][0] + got[-1][1]) // 2
                lo = max(c["start"], min(mid - need // 2, c["end"] - need))
                c["start"], c["end"] = lo, lo + need
            else:
                c["start"] = c["end"] - need
    merged.sort(key=lambda c: c["start"])

    # 录音里没说、整理时补上的话（如补全的偈颂）只剩一闪：连续几条这样的字幕先用前后的空隙，
    # 不够再从前后邻条借时间（邻条至少留下原时长的六成、不少于 MIN_SHOW），按所需时长比例分给这几条
    def need(c):
        return min(max(len(c["text"]) * READ_MS, MIN_SHOW), MAX_SHOW)

    def flash(c):
        return c["end"] - c["start"] < need(c) * 0.6

    def spare(c):
        d = c["end"] - c["start"]
        return max(d - max(MIN_SHOW, d * 0.6), 0)

    n = 0
    while n < len(merged):
        if not flash(merged[n]):
            n += 1
            continue
        m = n
        while m + 1 < len(merged) and flash(merged[m + 1]):
            m += 1
        run, prv = merged[n:m + 1], merged[n - 1] if n else None
        nxt = merged[m + 1] if m + 1 < len(merged) else None
        lo, hi = run[0]["start"], max(c["end"] for c in run)
        if nxt:
            hi = max(hi, nxt["start"])
        if prv:
            lo = min(lo, prv["end"])
        want = sum(need(c) for c in run) - (hi - lo)
        if want > 0:
            after = spare(nxt) if nxt else 0
            before = spare(prv) if prv else 0
            x = min(after, max(want / 2, want - before))
            y = min(before, want - x)
            hi, lo = hi + x, lo - y
            if nxt:
                nxt["start"] = int(hi)
            if prv:
                prv["end"] = int(lo)
        scale = min((hi - lo) / sum(need(c) for c in run), 1)
        t = lo
        for c in run:
            c["start"], t = int(t), t + need(c) * scale
            c["end"] = int(t)
        n = m + 1

    # 结束时间稍作延长，但不压到下一条
    for a, b in zip(merged, merged[1:]):
        a["end"] = max(min(a["end"] + 300, b["start"]), a["start"] + 200)
    if merged:
        merged[-1]["end"] += 300
    return merged


# ---------- 输出 ----------

def ts(ms):
    ms = max(0, int(ms))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_srt(path, cues):
    lines = []
    for n, c in enumerate(cues, 1):
        lines += [str(n), f"{ts(c['start'])} --> {ts(c['end'])}", c["text"], ""]
    path.write_text("\n".join(lines), "utf-8")


def asr_cues(hyp):
    """识别原文按停顿 >400ms 或满 MAX_LINE 字断句，仅供对照。"""
    cues, cur = [], []
    for tok in hyp:
        if cur and (tok[1] - cur[-1][2] > 400 or len(cur) >= MAX_LINE):
            cues.append(cur)
            cur = []
        cur.append(tok)
    if cur:
        cues.append(cur)
    return [{"text": "".join(t for t, _, _ in c), "start": c[0][1], "end": c[-1][2]} for c in cues]


def process(title, text, audio_paths, out_dir, asr_dir, device, homophones=False, drop_unread=False):
    """audio_paths 多于一个时，这几段音频共用 text：识别结果首尾相接一起对齐，字幕再按时间分回各段。"""
    stem = audio_paths[0].stem
    parts, offsets, hyp = [], [], []
    for path in audio_paths:
        part = asr(path, asr_dir / f"{path.stem}.json", device)
        base = hyp[-1][2] + JOIN_GAP if hyp else 0
        parts.append(part)
        offsets.append(base)
        hyp += [[t, s + base, e + base] for t, s, e in part]
    ref = ref_units(text)
    units = hyp_units(hyp)
    times, link, diffs, moves = align_all(text, ref, units)
    dropped = []
    if drop_unread:
        text, dropped = split_unread(text, ref, link, units)
        if dropped:
            ref = ref_units(text)
            times, link, diffs, moves = align_all(text, ref, units)
    hit = [j is not None for j in link]
    cues = build_cues(text, ref, times, hit)

    out_dir.mkdir(parents=True, exist_ok=True)
    for n, (path, part, base) in enumerate(zip(audio_paths, parts, offsets)):
        nxt = offsets[n + 1] if n + 1 < len(offsets) else float("inf")
        last = part[-1][2] if part else 0
        piece = [{**c, "start": min(c["start"] - base, last), "end": max(min(c["end"] - base, last + 1000), 0)}
                 for c in cues if (base <= c["start"] or n == 0) and c["start"] < nxt]
        write_srt(out_dir / f"{path.stem}.srt", piece)
        write_srt(asr_dir / f"{path.stem}.srt", asr_cues(part))

    n_ref, n_hit = len(ref), sum(hit)
    low = [c for c in cues if c["match"] < LOW_MATCH]
    rep = [
        f"# {title}",
        f"音频 {'、'.join(p.name for p in audio_paths)}",
        f"文稿读音 {n_ref} 字，识别 {len(units)} 字；锚点 {n_hit} 字（{n_hit / n_ref:.1%}），"
        f"其余按锚点间识别字摊开或贴近锚点",
        f"字幕 {len(cues)} 条，锚点比例 < {LOW_MATCH:.0%} 的 {len(low)} 条，按录音位置挪动的句子 {len(moves)} 句",
        "",
        "## 录音顺序与文稿不同、已按录音位置放置的句子",
    ]
    rep += [f"{ts(t)}  {s}" for t, s in moves]
    rep += ["", f"## 没有朗读、不出字幕的文稿（{len(dropped)} 行）"] + dropped
    rep += ["", "## 低匹配字幕条（时间可能不准，建议抽查）"]
    rep += [f"{ts(c['start'])}  {c['match']:.0%}  {c['text']}" for c in low]
    rep += ["", f"## 文稿与录音出入较大处（文稿连续 ≥{DIFF_REPORT} 字对不上，或录音连续 ≥{DIFF_HEARD} 字文稿里没有）"]
    for t, doc, said in diffs:
        rep += [f"{ts(t)}", f"    文稿：{doc.replace(chr(10), ' ') or '（无）'}", f"    录音：{said or '（无）'}"]

    # 拼音相同、字不同：识别字与文稿字同音，若识别字更合理，文稿可能有错
    def homophone(k):
        r = text[ref[k][0]]
        h = units[link[k]][3] if hit[k] else None
        return h and h != r and not r.isdigit() and not {r, h} <= set("他她它") \
            and not {r, h} <= set("的地得") and not {r, h} <= set("那哪")

    # 对齐本就按拼音比，同音字照样对上；识别对佛教名词常写成同音别字，这一节多是识别的错，按需才列
    k = n_ref
    if homophones:
        rep += ["", "## 同音异字（文稿 → 识别），可能是文稿错字，也可能是识别用字不同或口音"]
        k = 0
    while k < n_ref:
        if homophone(k):
            j = k
            while j < n_ref and homophone(j):
                j += 1
            ctx = text[max(0, ref[k][0] - 8):ref[j - 1][0] + 9].replace("\n", " ")
            r = "".join(text[ref[m][0]] for m in range(k, j))
            h = "".join(units[link[m]][3] for m in range(k, j))
            rep.append(f"{ts(times[k][0])}  {r} → {h}    …{ctx}…")
            k = j
        else:
            k += 1
    (out_dir / "report").mkdir(exist_ok=True)
    (out_dir / "report" / f"{stem}.report.txt").write_text("\n".join(rep) + "\n", "utf-8")
    return {"hit": n_hit / n_ref, "cues": len(cues), "low": len(low), "moves": len(moves), "diffs": len(diffs)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("md", type=Path, help="含 <SectionAudio> 的 md 文稿")
    ap.add_argument("--audio-dir", type=Path, required=True, help="本地音频目录，按 src 的文件名查找")
    ap.add_argument("--only", help="只处理音频文件名包含此字符串的段落")
    ap.add_argument("--out", type=Path, help="SRT 与报告的输出目录，默认 subtitles/srt/<md名>")
    ap.add_argument("--asr-dir", type=Path, default=ASR_DIR, help="识别结果缓存目录，默认 subtitles/asr")
    ap.add_argument("--homophones", action="store_true", help="报告里列出同音异字（查文稿错字用）")
    ap.add_argument("--device", default="auto", help="auto（有 Intel 核显用 xpu，否则 cpu）、xpu、cpu")
    ap.add_argument("--stop-at-heading", action="store_true", help="正文到下一个同级标题为止（其后的章节没有音频时用）")
    ap.add_argument("--drop-unread", action="store_true", help="音频逐字朗读文稿时用：整行对不上的不出字幕")
    ap.add_argument("--cpu-limit", type=float, help="CPU 总占用上限（百分比，仅 Windows），线程数随之收紧")
    args = ap.parse_args()

    if args.cpu_limit:
        global _threads, _job
        _job = limit_cpu(args.cpu_limit)
        _threads = max(1, int(os.cpu_count() * args.cpu_limit / 100))
        for var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS"):
            os.environ[var] = str(_threads)
        print(f"CPU 上限 {args.cpu_limit:g}%，{_threads} 线程", flush=True)

    todo = [g for g in audio_groups(sections(args.md, args.stop_at_heading))
            if not args.only or any(args.only in n for n in g[0])]
    if not todo:
        ap.error("没有匹配的段落")
    for names, title, text in todo:
        audios = [args.audio_dir / n for n in names]
        missing = [a.name for a in audios if not a.exists()]
        if missing:
            print(f"跳过（没有音频）{'、'.join(missing)}")
            continue
        r = process(title, text, audios, args.out or SRT_DIR / args.md.stem, args.asr_dir, args.device, args.homophones,
                    args.drop_unread)
        print(f"{'、'.join(names)}: 锚点 {r['hit']:.1%}  字幕 {r['cues']} 条  低匹配 {r['low']}  "
              f"挪位 {r['moves']} 句  出入较大 {r['diffs']} 处", flush=True)


if __name__ == "__main__":
    main()
