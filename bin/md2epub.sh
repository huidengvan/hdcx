echo "convert all .md files to .epub format under current folder"
echo $PWD
BASEDIR=$(dirname "$0")

for d in `ls *.md`; do
 echo $d
 name_without_ext="${d%.*}"
 echo "$name_without_ext"
 pandoc $(PWD)/$d --toc --toc-depth=6 --number-section --lua-filter $BASEDIR/count-para.lua  -o $(PWD)/$name_without_ext.epub
done


# /Applications/calibre.app/Contents/MacOS/ebook-convert $1.epub $1.mobi%  