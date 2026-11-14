#!/usr/bin/env python3
"""公開用の車体の形の値を、実車の外形 (STL) から測って作る。

使い方: python3 tools/fit_public_body.py <車体の STL> [出力先] [--step=0.02]
 出力先の既定は js/data/vehicle-public.js (公開してよい値だけ。コミットする)

公開するのは、車体の長さ方向 25 か所の「その位置の幅・高さ」と、キャノピーの位置・大きさ・全長だけ。
どの値も --step (既定 2 cm) の倍数に丸めるので、正確な寸法は出ない。STL の三角形そのものは出さない。
値は js/render/yata.js の buildYATA が読む形 (profiles: halfW / hullW / zPanel / zHull / zBell、各 [位置 0〜1, 値 m])。
"""
import sys, json, struct
import numpy as np

N = 21   # 長さ方向に測る位置の数 (5 % 刻み)

def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    step = 0.02
    for x in sys.argv[1:]:
        if x.startswith("--step="): step = float(x.split("=", 1)[1])
    if not args: print(__doc__); sys.exit(1)
    src = args[0]; dst = args[1] if len(args) > 1 else "js/data/vehicle-public.js"
    b = open(src, "rb").read(); n = struct.unpack("<I", b[80:84])[0]
    a = np.frombuffer(b, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n, offset=84)
    v = (a["v"].astype(np.float64) / 1000.0) * np.array([-1.0, 1.0, -1.0])   # 鼻先を -z へ
    z0, z1 = v[..., 2].min(), v[..., 2].max(); L = z1 - z0
    yg = 0.07 - v[..., 1].min()   # 下端を路面から 7 cm に (ゲームの車と同じ置き方)
    E = np.concatenate([v[:, [0, 1]], v[:, [1, 2]], v[:, [2, 0]]])   # 三角形の辺
    fn = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]); fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    c = v.mean(1); upTop = np.percentile(c[fn[:, 1] > 0.95, 1], 97)   # 上面の高さ (これより高い所はキャノピー)

    def section(zc):
        za, zb = E[:, 0, 2], E[:, 1, 2]; m = (za - zc) * (zb - zc) <= 0
        A, B = E[m, 0], E[m, 1]; d = B[:, 2] - A[:, 2]; t = np.where(np.abs(d) > 1e-12, (zc - A[:, 2]) / np.where(np.abs(d) > 1e-12, d, 1), 0.5)
        return A + (B - A) * t[:, None]

    rows = []
    for i in range(N):
        u = i / (N - 1); zc = z0 + min(max(u, 0.004), 0.996) * L; S = section(zc)
        if len(S) < 4: rows.append(None); continue
        ax = np.abs(S[:, 0]); halfW = ax.max(); rim = S[ax >= halfW - 0.004, 1].mean()
        low = S[S[:, 1] < rim - 0.06]; hullW = np.abs(low[:, 0]).max() if len(low) else halfW * 0.6
        top = S[(ax < halfW * 0.9) & (S[:, 1] <= upTop + 0.004)]; zPanel = top[:, 1].max() if len(top) else rim
        zBell = S[:, 1].min()   # 底: 断面のいちばん下 (車輪カバーの所は深くなり、車輪が隠れる)
        rows.append((u, halfW, hullW, zPanel + yg, rim + yg - 0.02, zBell + yg))
    good = [r for r in rows if r]
    # 非公開の実車の値 (手元にあれば) と同じ数字は公開しない: 丸めた値が一致したら 1 段ずらす
    priv = set()
    try:
        import re
        for t in re.findall(r"(?<![\w.])-?\d+\.\d+", open("js/data/vehicle-private.js").read()): priv.add(round(abs(float(t)), 4))
    except OSError: pass
    def r2(x):
        y = round(round(x / step) * step, 4)
        while round(abs(y), 4) in priv: y = round(y + (step if y >= 0 else -step), 4)
        return y
    prof = {k: [[round(r[0], 2), r2(r[j])] for r in good] for j, k in [(1, "halfW"), (2, "hullW"), (3, "zPanel"), (4, "zHull"), (5, "zBell")]}
    for k in ("halfW", "hullW"):   # 先端は細く (0 にはしない)
        prof[k][0][1] = max(prof[k][0][1], 0.001)
    can = c[c[:, 1] > upTop + 0.004]
    # 車輪: 車輪カバーのいちばん下の所 (下端から 6 cm 以内の点) を、横と前後の位置でまとめる。半径は一般的な値
    V = v.reshape(-1, 3); low = V[V[:, 1] < V[:, 1].min() + 0.06]; wheels = []
    if len(low):
        groups = []   # 近い点 (35 cm 以内) を 1 つの車輪に
        for q in low[:, [0, 2]]:
            for g in groups:
                if np.hypot(*(np.mean(g, 0) - q)) < 0.35: g.append(q); break
            else: groups.append([q])
        for g in groups:
            if len(g) < 3: continue
            m = np.mean(g, 0); wheels.append([r2(m[0]), r2(m[1] - (z0 + z1) / 2), 0.26, 0.1])
    body = {"L": r2(L), "wheels": wheels, "livery": True, "orangeU": 0.03, "fairings": True, "noseTip": prof["zBell"][0][1],
            "canopy": {"x": r2(can[:, 2].mean() - z0), "len": r2(can[:, 2].max() - can[:, 2].min()), "w": r2(2 * np.abs(can[:, 0]).max()), "top": r2(can[:, 1].max() + yg)},
            "profiles": prof}
    print("車輪", wheels)
    js = ('"use strict";\n/* ============ 公開用の車体の形 (実車の外形から測って %g cm 単位に丸めた値。tools/fit_public_body.py が作る) ============\n'
          ' 実車の値 (js/data/vehicle-private.js) が無い端末で、自分の車 (YATA) の形に使う。正確な寸法ではない */\n'
          'const YATA_PUBLIC_BODY=%s;\n') % (step * 100, json.dumps(body, separators=(",", ":")))
    open(dst, "w").write(js)
    print("書き出し:", dst, "全長", body["L"], "キャノピー", body["canopy"], "位置の数", len(good))

if __name__ == "__main__":
    main()
