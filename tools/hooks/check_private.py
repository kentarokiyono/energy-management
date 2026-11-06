"""コミット前の検査: js/data/vehicle-private.js そのもの、またはその特徴的な値 (文字列・桁の多い数値) が
ステージされた変更に入っていたら止める。値は手元の非公開ファイルから読むので、このスクリプト自体に値は含まない。"""
import re, subprocess, sys, os
PRIV = "js/data/vehicle-private.js"
def git(*a): return subprocess.run(["git", *a], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
staged = [f for f in git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n") if f]
if any(f.replace("\\", "/").endswith("vehicle-private.js") for f in staged):
    print("✗ " + PRIV + " はコミットできません (非公開)。 git restore --staged " + PRIV); sys.exit(1)
if not os.path.exists(PRIV): sys.exit(0)
src = open(PRIV, encoding="utf-8").read()
src = re.sub(r"/\*.*?\*/", "", src, flags=re.S); src = re.sub(r"//[^\n]*", "", src)
GENERIC = {"use strict"}
strs = {s for s in re.findall(r'"([^"\n]{4,})"', src) if s not in GENERIC}
nums = {n for n in re.findall(r"(?<![\w.])(\d+\.\d{3,})(?![\w.])", src)}   # 小数 3 桁以上 (偶然一致しにくいもの)
added = [l[1:] for l in git("diff", "--cached", "-U0", "--", ".", ":!assets/fonts", ":!js/lib").split("\n") if l.startswith("+") and not l.startswith("+++")]
hits = []
for i, line in enumerate(added):
    for s in strs:
        if s in line: hits.append(("文字列", s))
    for n in nums:
        if re.search(r"(?<![\w.])" + re.escape(n) + r"(?![\w.])", line): hits.append(("数値", n))
if hits:
    kinds = sorted({k for k, _ in hits})
    print("✗ 非公開の実車諸元と同じ値が %d 件、ステージされた変更に含まれています (%s)。" % (len(hits), "・".join(kinds)))
    print("  該当: " + ", ".join(sorted({v[:4] + "…" for _, v in hits})))
    print("  意図したものなら git commit --no-verify で回避できます。")
    sys.exit(1)
