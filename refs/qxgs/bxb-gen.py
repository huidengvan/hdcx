import urllib.parse
from datetime import datetime, timedelta

classStartDate = "2024-03-06"
# current_date = datetime.now()
current_date = datetime.strptime(classStartDate, "%Y-%m-%d")

def updateNextClassDate():
    global current_date
    next_day = current_date + timedelta(days=1)
    if next_day.weekday() == 6:
        next_day = next_day + timedelta(days=1)
        print ('| 星期日 | 休息 | |')

    if next_day.strftime("%Y-%m-%d") == "2024-05-10":
        next_day = next_day + timedelta(days=17)
        print ('| 金萨法会 | 共修暂停 | |')
        print ('| 金萨法会 | 共修暂停 | |')
        print ('| 金萨法会 | 共修暂停 | |')

    current_date = next_day
    

def genClassSchedule(urlsec, fromClass, toClass, desc):
    global current_date
    for num in range(fromClass,toClass +1):
        
        str1="前行广释第" # 02课
        str2="课"
        className = urllib.parse.quote(str1) + '{:0=3d}'.format(num) + urllib.parse.quote(str2)
        fullUrl = 'https://www.huidengchanxiu.net/refs/qxgs/' + urlsec + '#' + className
        mdClassStr = ('[' + str1 + '{:0=3d}'.format(num) + str2 + ']''('+fullUrl+')')
        print ('| ' + current_date.strftime("%Y-%m-%d") + ' | ' + mdClassStr + ' | ' + desc + ' | ')
        updateNextClassDate()

        # ========= fudao ==============
        str3 = '前行广释第'
        str4 = '课辅导'
        fdClassName = urllib.parse.quote(str3) + '{:0=3d}'.format(num) + urllib.parse.quote(str4)
        fullFDUrl = 'https://www.huidengchanxiu.net/refs/qxgs/fudao/' + urlsec.replace('-', 'fd-') + '#' + fdClassName
        # print (fullFDUrl)
        mdFDClassStr = ('[' + str3 + '{:0=3d}'.format(num) + str4 + ']''('+fullFDUrl+')')
        print ('| ' + current_date.strftime("%Y-%m-%d") + ' | ' + mdFDClassStr + ' | ' + desc + ' | ')
        updateNextClassDate()

    print('|  |  |  |')
    

print ('| 日期 | 学习内容 | 备注 |')
print ('|---|---|---|')

genClassSchedule('qxgs-01yw',1,2,'引文')
genClassSchedule('qxgs-02wffs',3,13,'闻法方式')
genClassSchedule('qxgs-03xm',14,27,'暇满难得')
genClassSchedule('qxgs-04wc',28,39,'寿命无常')
genClassSchedule('qxgs-05lh',40,58,'轮回痛苦')
genClassSchedule('qxgs-06yg',59,72,'因果不虚')
genClassSchedule('qxgs-07jtly',73,83,'解脱利益 依止上师')
genClassSchedule('qxgs-08gy',84,90,'皈依')
