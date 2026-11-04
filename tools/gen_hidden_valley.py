"""Hidden Valley Raceway のコースデータ生成.

入力:
  assets/hidden-valley.gpx          中心線 (OpenStreetMap, ODbL)
  fast_lane.ai / pit_lane.ai        Assetto Corsa の AI ライン (標高・ピットレーン・走行ライン用, 非同梱)
出力:
  js/data/hidden-valley.js          シーン座標 (x=東, y=標高, z=-北) [m], 原点=S/F

使い方: python3 tools/gen_hidden_valley.py <fast_lane.ai> <pit_lane.ai>
"""
import json, math, re, struct, sys
import numpy as np

R_E = 6371000.0


def read_ai(fn):
    b = open(fn, 'rb').read()
    n = struct.unpack_from('<4i', b, 0)[1]
    return np.array([struct.unpack_from('<4fi', b, 16 + i * 20)[:4] for i in range(n)])


def gpx_xy(fn):
    s = open(fn).read()
    ll = np.array([(float(a), float(b)) for a, b in re.findall(r'lat="([-\d.]+)" lon="([-\d.]+)"', s)])
    lat0, lon0 = ll[:, 0].mean(), ll[:, 1].mean()
    xy = np.c_[(ll[:, 1] - lon0) * math.cos(math.radians(lat0)) * math.pi / 180 * R_E,
               (ll[:, 0] - lat0) * math.pi / 180 * R_E]
    if np.allclose(xy[0], xy[-1]):
        xy = xy[:-1]
    return xy, lat0, lon0


def densify(P, step, closed):
    Q = np.vstack([P, P[:1]]) if closed else P
    out = []
    for i in range(len(Q) - 1):
        a, b = Q[i], Q[i + 1]
        k = max(1, int(np.linalg.norm(b - a) / step))
        for t in range(k):
            out.append(a + (b - a) * t / k)
    if not closed:
        out.append(Q[-1])
    return np.array(out)


def smooth_closed(P, w):
    k = np.ones(2 * w + 1) / (2 * w + 1)
    return np.array([np.convolve(np.r_[P[-w:, j], P[:, j], P[:w, j]], k, 'valid') for j in range(P.shape[1])]).T


def resample(P, step, closed):
    Q = np.vstack([P, P[:1]]) if closed else P
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    n = int(round(s[-1] / step))
    t = np.linspace(0, s[-1], n, endpoint=not closed)
    return np.array([np.interp(t, s, Q[:, j]) for j in range(Q.shape[1])]).T, s[-1]


def _icp(A, Gd, X0, iters):
    X = X0
    for _ in range(iters):
        d = ((X[:, None, :] - Gd[None, :, :]) ** 2).sum(-1)
        nn = Gd[d.argmin(1)]
        mx, my = X.mean(0), nn.mean(0)
        U, S, Vt = np.linalg.svd((X - mx).T @ (nn - my))
        Rr = (U @ Vt).T
        if np.linalg.det(Rr) < 0:
            Vt[1] *= -1
            Rr = (U @ Vt).T
        X = (X - mx) @ Rr.T + my
    return X, math.sqrt(d.min(1).mean())


def fit_ac(F, G):
    """AC (x,z) を GPX 平面へ剛体変換 (鏡映+回転+並進) で ICP 位置合わせ。粗探索→全点で精密化"""
    Gd = densify(G, 2.0, True)
    best = None
    for refl in (1, -1):
        A = np.c_[F[::10, 0], refl * F[::10, 2]]
        for th in np.radians(np.arange(0, 360, 10)):
            Rm = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
            X = A @ Rm.T
            X, err = _icp(A, Gd[::4], X - X.mean(0) + Gd.mean(0), 20)
            if best is None or err < best[0]:
                best = (err, refl, th)
    _, refl, th = best
    A = np.c_[F[:, 0], refl * F[:, 2]]
    Rm = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
    X = A @ Rm.T
    X, _ = _icp(A, Gd[::4], X - X.mean(0) + Gd.mean(0), 20)
    X, err = _icp(A, Gd, X, 15)
    M = np.linalg.lstsq(np.c_[A, np.ones(len(A))], X, rcond=None)[0]
    return refl, M, err


def main(fast_fn, pit_fn):
    G, lat0, lon0 = gpx_xy('assets/hidden-valley.gpx')
    F, PL = read_ai(fast_fn), read_ai(pit_fn)
    refl, M, err = fit_ac(F, G)
    T = lambda P: np.c_[P[:, 0], refl * P[:, 2], np.ones(len(P))] @ M
    Fx, PLx = T(F), T(PL)
    print(f'AC→GPX fit rms {err:.2f} m')
    # 中心線: OSM の折れ線を平滑化して 3m 間隔へ
    C = smooth_closed(densify(G, 1.0, True), 3)
    C, L = resample(C, 3.0, True)
    # 標高: 最寄りの AC 点の高さ → 沿線平滑化
    d = ((C[:, None, :] - Fx[None, :, :]) ** 2).sum(-1)
    elev = smooth_closed(F[d.argmin(1), 1][:, None], 4)[:, 0]
    # S/F = AC 原点 (fast_lane 0 番) に最も近い中心線点, 周回方向 = OSM の順序 (反時計回り)
    i0 = int(((C - Fx[0]) ** 2).sum(1).argmin())
    C, elev = np.roll(C, -i0, 0), np.roll(elev, -i0)
    org = C[0].copy()
    sc = lambda P: [[round(float(p[0] - org[0]), 2), round(float(p[1] - org[1]) * -1, 2)] for p in P]
    cen = [[x, round(float(e), 2), z] for (x, z), e in zip(sc(C), elev)]
    # ピットレーン (AC) 4m 間隔
    Pp, _ = resample(np.c_[PLx, PL[:, 1]], 4.0, False)
    pit = [[round(float(p[0] - org[0]), 2), round(float(p[2]), 2), round(float(-(p[1] - org[1])), 2)] for p in Pp]
    # 走行ライン (ラバー跡用) 6m 間隔
    Rl, _ = resample(np.c_[Fx, F[:, 1]], 6.0, True)
    race = [[round(float(p[0] - org[0]), 1), round(float(-(p[1] - org[1])), 1)] for p in Rl]
    out = {
        'source': 'Centreline: OpenStreetMap way 122524476 (© OpenStreetMap contributors, ODbL). '
                  'Elevation, pit lane and racing line derived from Assetto Corsa AI lines.',
        'length': round(float(L), 1), 'origin_latlon': [lat0, lon0], 'origin_offset_m': [round(float(org[0]), 2), round(float(org[1]), 2)],
        'centre': cen, 'pit': pit, 'racing': race,
    }
    open('js/data/hidden-valley.js', 'w').write(
        '"use strict";\n/* Hidden Valley Raceway (Darwin) — generated by tools/gen_hidden_valley.py */\n'
        'const HV_DATA=' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(f'length {L:.1f} m, centre {len(cen)} pts, elev {elev.min():.1f}..{elev.max():.1f} m, pit {len(pit)} pts')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
