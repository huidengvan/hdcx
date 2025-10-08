echo "--- `date` $1 ---"
pandoc $1 -s -f markdown \
    -V 'CJKmainfont:Yuanti SC' \
    --pdf-engine=xelatex --toc --toc-depth=6 --tab-stop=2 --number-section  \
    -H $(dirname $0)/pdf-options.sty \
    --lua-filter $(dirname $0)/count-para.lua \
    -o $1.pdf

echo "--- `date` $1 done. ---" 
echo ""
