#!/usr/bin/env python3
"""車体の外形 (STL) から、ゲームが読む軽い形のデータを作る。

使い方: python3 tools/make_vehicle_mesh.py <車体の STL> [出力先]
 出力先の既定は js/data/vehicle-mesh-private.bin (コミットしない。.gitignore 済み)

やること
 ・STL (mm, 鼻先が +z) を、ゲームの車の向き (m, 鼻先が -z, 前後の中心が 0) に直す
 ・三角形を部位に分ける: lower (下の胴体) / upperPaint (上の板の縁と裏) / deck (上面 = 太陽電池) / canopy
   上下の分かれ目は、パネルの縁 (その位置でいちばん外側の点) の高さ
 ・同じ位置の頂点をまとめ、折れ目 (40 度以上) は残して滑らかな法線を付ける
 ・頂点ごとに uv を付ける: 塗装は (u = 鼻先からの割合, zn = 下端から縁までの高さの割合)、deck は (鼻先からの距離 m, 横の位置 m + 0.9)

形式: "YMSH1" + uint32 (ヘッダーの長さ) + ヘッダー (JSON) + 部位ごとに pos f32[nv*3], nrm f32[nv*3], uv f32[nv*2], idx u32[ni]
"""
import sys, json, struct
import numpy as np

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else "js/data/vehicle-mesh-private.bin"
    b = open(src, "rb").read(); n = struct.unpack("<I", b[80:84])[0]
    if 84 + n * 50 != len(b): raise SystemExit("バイナリ形式の STL ではありません")
    a = np.frombuffer(b, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n, offset=84)
    v = (a["v"].astype(np.float64) / 1000.0) * np.array([-1.0, 1.0, -1.0])   # y 軸まわりに 180 度: 鼻先を -z へ (裏返らない)
    zc = (v[..., 2].min() + v[..., 2].max()) / 2; v[..., 2] -= zc
    L = v[..., 2].max() - v[..., 2].min(); z0 = v[..., 2].min()
    c = v.mean(1); fn = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]); ar = np.linalg.norm(fn, axis=1); ok = ar > 1e-12
    v, c, fn, ar = v[ok], c[ok], fn[ok], ar[ok]; fn = fn / ar[:, None]

    # 小さい別の部品 (キャノピーの内側の面) は外す: つながった三角形のかたまりのうち、いちばん大きいものだけ使う
    V = v.reshape(-1, 3); q = np.round(V / 0.0005).astype(np.int64); _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1, 3)
    par = np.arange(inv.max() + 1)
    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    for t in inv:
        r0 = find(t[0])
        for k in (1, 2):
            r = find(t[k])
            if r != r0: par[r] = r0
    root = np.array([find(x) for x in range(len(par))])[inv[:, 0]]
    ids, cnt = np.unique(root, return_counts=True); keep = root == ids[np.argmax(cnt)]
    v, c, fn, ar = v[keep], c[keep], fn[keep], ar[keep]; V = v.reshape(-1, 3)

    # パネルの縁の高さ (前後の位置ごと): その位置でいちばん外側の点の高さ
    # (頂点だけで見ると、大きな三角形の所で縁を取り違える。三角形の辺が各位置の断面を横切る点で調べる)
    NB = 240; rim = np.full(NB, np.nan)
    E = np.concatenate([v[:, [0, 1]], v[:, [1, 2]], v[:, [2, 0]]]); za = E[:, 0, 2]; zb2 = E[:, 1, 2]
    for i in range(NB):
        zc_ = z0 + (i + 0.5) / NB * L; m = (za - zc_) * (zb2 - zc_) <= 0
        if m.sum() < 3: continue
        A = E[m, 0]; B = E[m, 1]; d = B[:, 2] - A[:, 2]; t = np.where(np.abs(d) > 1e-12, (zc_ - A[:, 2]) / np.where(np.abs(d) > 1e-12, d, 1), 0.5)
        Pt = A + (B - A) * t[:, None]; w = np.abs(Pt[:, 0]); rim[i] = Pt[w >= w.max() - 0.002, 1].mean()
    idx = np.arange(NB); good = ~np.isnan(rim); rim = np.interp(idx, idx[good], rim[good])
    rim = np.convolve(np.pad(rim, 4, mode="edge"), np.ones(9) / 9, mode="valid")
    rimAt = lambda z: np.interp((z - z0) / L * NB - 0.5, idx, rim)
    wide = np.abs(V[:, 0]) >= np.abs(V[:, 0]).max() - 0.004; rimWide = float(V[wide, 1].mean())
    yBot = float(np.percentile(V[:, 1], 2.0)); deckTop = float(np.percentile(c[(fn[:, 1] > 0.95), 1], 97))

    # 部位
    r = rimAt(c[:, 2]); upper = c[:, 1] >= r - 0.012
    # キャノピー: 上面より高い所。すそは横向きの面 (上面は上向き) で見分ける
    foot = c[:, 1] > deckTop + 0.004
    fx0, fx1, fz0, fz1 = c[foot, 0].min(), c[foot, 0].max(), c[foot, 2].min(), c[foot, 2].max()
    inFoot = (c[:, 0] > fx0 - 0.03) & (c[:, 0] < fx1 + 0.03) & (c[:, 2] > fz0 - 0.03) & (c[:, 2] < fz1 + 0.03)
    canopy = upper & (foot | (inFoot & (fn[:, 1] < 0.6) & (c[:, 1] > deckTop - 0.03)))
    deck = upper & ~canopy & (fn[:, 1] > 0.6)
    part = np.where(canopy, 3, np.where(deck, 2, np.where(upper, 1, 0)))
    names = ["lower", "upperPaint", "deck", "canopy"]

    out = []; head = {"version": 1, "length": float(L), "rimWide": rimWide, "yBottom": yBot, "deckTop": deckTop, "groups": []}
    cos40 = np.cos(np.radians(40))
    for gi, name in enumerate(names):
        m = part == gi; tv = v[m]; tn = fn[m]; ta = ar[m]; nt = len(tv)
        if nt == 0: head["groups"].append({"name": name, "nv": 0, "ni": 0}); continue
        P = tv.reshape(-1, 3); key = np.round(P / 0.0005).astype(np.int64)
        _, pinv = np.unique(key, axis=0, return_inverse=True)
        # 折れ目を残す: 同じ位置でも、面の向きが 40 度以上違えば別の頂点にする
        clusters = {}; vid = np.zeros(nt * 3, dtype=np.int64); pos = []; nrm = []
        for ci in range(nt * 3):
            f = ci // 3; fnv = tn[f]; lst = clusters.setdefault(int(pinv[ci]), [])
            for j in lst:
                nn = nrm[j]; ln = np.sqrt(nn[0] * nn[0] + nn[1] * nn[1] + nn[2] * nn[2])
                if ln > 0 and (nn[0] * fnv[0] + nn[1] * fnv[1] + nn[2] * fnv[2]) / ln > cos40:
                    nrm[j] = nn + fnv * ta[f]; vid[ci] = j; break
            else:
                pos.append(P[ci]); nrm.append(fnv * ta[f]); lst.append(len(pos) - 1); vid[ci] = len(pos) - 1
        pos = np.array(pos, dtype=np.float32); nrm = np.array(nrm); nrm = (nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)).astype(np.float32)
        u = (pos[:, 2] - z0) / L
        if name == "deck": uv = np.stack([pos[:, 2] - z0, pos[:, 0] + 0.9], 1)
        else:
            rr = rimAt(pos[:, 2].astype(np.float64)); zn = np.clip((pos[:, 1] - yBot) / np.maximum(rr - yBot, 0.02), 0, 1)
            if name == "upperPaint": zn = np.ones_like(zn)
            uv = np.stack([u, zn], 1)
        out.append((pos, nrm, uv.astype(np.float32), vid.astype(np.uint32)))
        head["groups"].append({"name": name, "nv": int(len(pos)), "ni": int(len(vid))})
    hb = json.dumps(head).encode(); hb += b" " * ((4 - (5 + 4 + len(hb)) % 4) % 4)
    with open(dst, "wb") as f:
        f.write(b"YMSH1"); f.write(struct.pack("<I", len(hb))); f.write(hb)
        for pos, nrm, uv, vid in out:
            f.write(pos.tobytes()); f.write(nrm.tobytes()); f.write(uv.tobytes()); f.write(vid.tobytes())
    print("書き出し:", dst, {g["name"]: (g["nv"], g["ni"] // 3) for g in head["groups"]}, "縁の高さ %.3f 底 %.3f 上面 %.3f" % (rimWide, yBot, deckTop))

if __name__ == "__main__":
    main()
