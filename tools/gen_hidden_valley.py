"""Hidden Valley Raceway のコースデータ生成.

入力:
  assets/hidden-valley.gpx          中心線 (OpenStreetMap, ODbL)
  fast_lane.ai / pit_lane.ai        Assetto Corsa の AI ライン (標高・ピットレーン・走行ライン用, 非同梱)
  akv8_hiddenvalley2.kn5 (任意)     AC の路面モデル。白線(STRP)からコース端を求め、中心線を路面中央へ補正 (非同梱)
出力:
  js/data/hidden-valley.js          シーン座標 (x=東, y=標高, z=-北) [m], 原点=S/F

使い方: python3 tools/gen_hidden_valley.py <fast_lane.ai> <pit_lane.ai> [akv8_hiddenvalley2.kn5]
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


def read_kn5_meshes(fn):
    """kn5 (v5/v6) のメッシュ頂点をワールド座標で返す: [(node名, マテリアル名, Nx3)]"""
    b = open(fn, 'rb').read()
    o = [6]
    def i32():
        v = struct.unpack_from('<i', b, o[0])[0]; o[0] += 4; return v
    def f32(n):
        v = struct.unpack_from('<%df' % n, b, o[0]); o[0] += 4 * n; return v
    def u8():
        v = b[o[0]]; o[0] += 1; return v
    def st():
        n = i32(); v = b[o[0]:o[0] + n].decode('latin1'); o[0] += n; return v
    assert b[:6] == b'sc6969'
    ver = i32()
    if ver > 5:
        i32()
    for _ in range(i32()):
        i32(); st(); L = i32(); o[0] += L
    mats = []
    for _ in range(i32()):
        name = st(); st(); u8(); u8()
        if ver > 4:
            i32()
        for _ in range(i32()):
            st(); f32(10)
        for _ in range(i32()):
            st(); i32(); st()
        mats.append(name)
    out = []
    def node(M):
        cls = i32(); name = st(); nch = i32(); u8()
        if cls == 1:
            M2 = np.array(f32(16)).reshape(4, 4) @ M
        elif cls == 2:
            u8(); u8(); u8(); nv = i32()
            v = np.frombuffer(b, dtype='<f4', count=nv * 11, offset=o[0]).reshape(nv, 11); o[0] += nv * 44
            ni = i32(); o[0] += ni * 2
            mid = i32(); i32(); f32(2); f32(4); u8()
            out.append((name, mats[mid] if mid < len(mats) else '?', (np.c_[v[:, :3], np.ones(nv)] @ M)[:, :3]))
            M2 = M
        else:
            raise ValueError('unsupported node class %d' % cls)
        for _ in range(nch):
            node(M2)
    node(np.eye(4))
    return out


def track_edges(C, T_ac, kn5_fn):
    """白線(STRP_*)頂点から各中心線点の左右端 [m] (右=+)。中心線は (x,北) 平面"""
    P = np.vstack([m[2] for m in read_kn5_meshes(kn5_fn) if m[1].startswith('STRP')])
    X = T_ac(P)
    n = len(C)
    Tn = np.roll(C, -1, 0) - np.roll(C, 1, 0); Tn /= np.linalg.norm(Tn, axis=1)[:, None]
    Rn = np.c_[Tn[:, 1], -Tn[:, 0]]           # 進行方向の右 (x=東, y=北)
    idx = np.empty(len(X), int)
    for k in range(0, len(X), 4000):
        idx[k:k + 4000] = ((X[k:k + 4000, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    lat = ((X - C[idx]) * Rn[idx]).sum(1)
    E = np.full((n, 2), np.nan)
    for i in range(n):
        l = lat[idx == i]; l = l[np.abs(l) < 14]
        if (l < 0).any(): E[i, 0] = l[l < 0].min()
        if (l > 0).any(): E[i, 1] = l[l > 0].max()
    for j in range(2):                         # 欠損補間 → 平滑化
        ok = np.isfinite(E[:, j]); xi = np.arange(n)
        E[:, j] = np.interp(xi, xi[ok], E[ok, j], period=n)
    E = smooth_closed(E, 6)
    return E, Rn


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


def main(fast_fn, pit_fn, kn5_fn=None):
    G, lat0, lon0 = gpx_xy('assets/hidden-valley.gpx')
    F, PL = read_ai(fast_fn), read_ai(pit_fn)
    refl, M, err = fit_ac(F, G)
    T = lambda P: np.c_[P[:, 0], refl * P[:, 2], np.ones(len(P))] @ M
    Fx, PLx = T(F), T(PL)
    print(f'AC→GPX fit rms {err:.2f} m')
    # 中心線: OSM の折れ線を平滑化して 3m 間隔へ
    C = smooth_closed(densify(G, 1.0, True), 3)
    C, L = resample(C, 3.0, True)
    half = None
    if kn5_fn:
        E, Rn = track_edges(C, T, kn5_fn)
        C = C + Rn * ((E[:, 0] + E[:, 1]) / 2)[:, None]     # 路面中央へ補正
        half = (E[:, 1] - E[:, 0]) / 2
        print(f'track width (between edge lines) median {np.median(half*2):.2f} m, min {half.min()*2:.2f}, max {half.max()*2:.2f}')
    # 標高: 最寄りの AC 点の高さ → 沿線平滑化
    d = ((C[:, None, :] - Fx[None, :, :]) ** 2).sum(-1)
    elev = smooth_closed(F[d.argmin(1), 1][:, None], 4)[:, 0]
    # S/F = AC 原点 (fast_lane 0 番) に最も近い中心線点, 周回方向 = OSM の順序 (反時計回り)
    i0 = int(((C - Fx[0]) ** 2).sum(1).argmin())
    C, elev = np.roll(C, -i0, 0), np.roll(elev, -i0)
    if half is not None:
        half = np.roll(half, -i0)
    # 原点 = S/F の AC 原点 (中心線補正前後で不変)
    org = Fx[0].copy()
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
        'half_width': None if half is None else [round(float(h), 2) for h in half],
    }
    open('js/data/hidden-valley.js', 'w').write(
        '"use strict";\n/* Hidden Valley Raceway (Darwin) — generated by tools/gen_hidden_valley.py */\n'
        'const HV_DATA=' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(f'length {L:.1f} m, centre {len(cen)} pts, elev {elev.min():.1f}..{elev.max():.1f} m, pit {len(pit)} pts')


if __name__ == '__main__':
    main(*sys.argv[1:4])
