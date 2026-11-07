#!/usr/bin/env python3
"""実データの取得 (ルートの形・標高・2025 年大会期間の天気) → js/data/route-geo.js, js/data/weather-2025.js

 1. 道路の形: OSRM (OpenStreetMap の道路網) で、公式ルートの町を経由点にして Darwin → Adelaide の線を取る
    → 公式の km (Route Notes) と経由点で合わせ、距離の比で 100 m ごとの位置に直す
 2. 標高: Open-Meteo Elevation API (Copernicus DEM GLO-90) を 100 m ごとに取り、500 m 幅でならして勾配を出す
 3. 天気: Open-Meteo Historical Weather API (ERA5 再解析) の 1 時間値を、ルート上 100 km ごとに取る
    (日射 GHI・直達 DNI・散乱・気温・風速・風向・雲量。2025-08-22 〜 2025-09-01, オーストラリア中部時間)
 使い方: python3 tools/fetch_real_data.py   (キャッシュ: tools/real-cache/)
"""
import json, math, os, sys, time, urllib.request, urllib.parse, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "real-cache")
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "bwsc-sim-data-tool/1.0"}

import hashlib
def get(url, name):
    p = os.path.join(CACHE, name.replace(".json", "_" + hashlib.sha1(url.encode()).hexdigest()[:10] + ".json"))
    if os.path.exists(p):
        return json.load(open(p))
    for k in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = json.load(r)
            json.dump(d, open(p, "w"))
            time.sleep(0.4)
            return d
        except Exception as e:
            print("  retry", k, e, file=sys.stderr); time.sleep(min(60, 3 * (k + 1)))
    raise SystemExit("取得できません: " + url[:120])

def hav(a, b):
    R = 6371008.8; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def decode_polyline(s, prec=6):
    pts, i, lat, lon, f = [], 0, 0, 0, 10 ** prec
    while i < len(s):
        for which in (0, 1):
            sh = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1; res |= (b & 0x1f) << sh; sh += 5
                if b < 0x20: break
            v = ~(res >> 1) if res & 1 else res >> 1
            if which == 0: lat += v
            else: lon += v
        pts.append((lat / f, lon / f))
    return pts

# ---- 公式ルートの経由点 (km は Route Notes, 位置は js/data.js の ROUTE) ----
src = open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8").read()
ROUTE = [(m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4)))
         for m in re.finditer(r'name:"([^"]+)",\s*km:([\d.]+),\s*elev:[\d.]+,\s*lat:([-\d.]+),\s*lon:([-\d.]+)', src)]
VIA = ["Darwin", "Katherine", "Tennant Creek", "Alice Springs", "Coober Pedy", "Port Augusta", "Adelaide Victoria Park"]   # (data.js の Gawler は町の中心ではないので使わない)
wps = [r for r in ROUTE if any(r[0].startswith(v) for v in VIA)]
print("経由点:", [(w[0], w[1]) for w in wps])
TOTAL = ROUTE[-1][1]

# ---- 1. 道路の形 ----
coords = ";".join(f"{w[3]},{w[2]}" for w in wps)
d = get(f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=polyline6&steps=false&continue_straight=true", "osrm_route.json")
rt = d["routes"][0]
line = decode_polyline(rt["geometry"])
cum = [0.0]
for a, b in zip(line, line[1:]): cum.append(cum[-1] + hav(a, b))
# 各経由点に最も近い線上の点 → 公式 km と線上距離の対応
anchors = []
j0 = 0
for w in wps:
    best, bj = 1e18, j0
    for j in range(j0, len(line)):          # 前の経由点より先で、いちばん近い点
        dd = hav((w[2], w[3]), line[j])
        if dd < best: best, bj = dd, j
        if cum[j] - cum[j0] > 900000: break
    anchors.append((w[1] if w[1] < TOTAL else TOTAL, cum[bj])); j0 = bj
    print(f"  {w[0]:<26} 公式 {w[1]:7.1f} km  道路 {cum[bj]/1000:7.1f} km  (ずれ {best:.0f} m)")
anchors[0] = (0.0, 0.0); anchors[-1] = (TOTAL, cum[-1])
def to_line(km):
    for (k0, d0), (k1, d1) in zip(anchors, anchors[1:]):
        if km <= k1: return d0 + (d1 - d0) * (km - k0) / max(1e-9, k1 - k0)
    return anchors[-1][1]
def pos_at(dist):
    lo, hi = 0, len(cum) - 1
    while lo < hi:
        m = (lo + hi) // 2
        if cum[m] < dist: lo = m + 1
        else: hi = m
    j = max(1, lo); a, b = line[j - 1], line[j]; t = (dist - cum[j - 1]) / max(1e-9, cum[j] - cum[j - 1])
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
STEP = 0.1
N = int(TOTAL / STEP) + 1
pts = [pos_at(to_line(min(TOTAL, i * STEP))) for i in range(N)]
print(f"道路の線: {len(line)} 点, {cum[-1]/1000:.1f} km → 公式 {TOTAL} km, 100 m ごと {N} 点")

# ---- 2. 標高 (100 点ずつ) ----
elev = []
for k in range(0, N, 100):
    chunk = pts[k:k + 100]
    q = urllib.parse.urlencode({"latitude": ",".join(f"{p[0]:.5f}" for p in chunk), "longitude": ",".join(f"{p[1]:.5f}" for p in chunk)})
    e = get("https://api.open-meteo.com/v1/elevation?" + q, f"elev_{k:06d}.json")["elevation"]
    elev += e
    if k % 5000 == 0: print("  標高", k, "/", N)
# ならし (500 m の三角窓)
W = 5
sm = []
for i in range(N):
    a, b = max(0, i - W), min(N - 1, i + W)
    ws = [(W + 1 - abs(j - i)) for j in range(a, b + 1)]
    sm.append(sum(elev[j] * w for j, w in zip(range(a, b + 1), ws)) / sum(ws))
grades = [(sm[min(N - 1, i + 1)] - sm[max(0, i - 1)]) / (STEP * 1000 * (min(N - 1, i + 1) - max(0, i - 1))) for i in range(N)]
print(f"標高 {min(sm):.0f}–{max(sm):.0f} m, 勾配 最大 {max(grades)*100:.1f} % / 最小 {min(grades)*100:.1f} %")

# 位置は 500 m ごと (1e-5 度の差分), 標高は 100 m ごと (0.1 m 単位の差分)
P5 = pts[::5]
lat_d, lon_d, pl, po = [], [], 0, 0
for la, lo in P5:
    a, b = round(la * 1e5), round(lo * 1e5); lat_d.append(a - pl); lon_d.append(b - po); pl, po = a, b
el_d, pe = [], 0
for v in sm:
    a = round(v * 10); el_d.append(a - pe); pe = a
with open(os.path.join(ROOT, "js", "data", "route-geo.js"), "w", encoding="utf-8") as f:
    f.write('"use strict";\n/* 実際の道路の形と標高 (tools/fetch_real_data.py が作成)\n'
            ' 位置: OpenStreetMap の道路網 (OSRM で経路を取得, © OpenStreetMap contributors, ODbL)\n'
            ' 標高: Copernicus DEM GLO-90 (Open-Meteo Elevation API 経由) を 500 m 幅でならしたもの\n'
            ' 公式 km 0 から: 位置は 500 m ごと (1e-5 度の差分), 標高は 100 m ごと (0.1 m の差分) */\n')
    f.write("const ROUTE_GEO={stepPos:0.5,stepElev:0.1,\n")
    f.write(" lat:[" + ",".join(map(str, lat_d)) + "],\n lon:[" + ",".join(map(str, lon_d)) + "],\n elev:[" + ",".join(map(str, el_d)) + "]};\n")
print("書き出し: js/data/route-geo.js", os.path.getsize(os.path.join(ROOT, "js", "data", "route-geo.js")) // 1024, "KB")

# ---- 3. 天気 (2025 年大会の期間, 100 km ごと) ----
START, END = "2025-08-22", "2025-09-01"
VARS = ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation", "temperature_2m", "wind_speed_10m", "wind_direction_10m", "cloud_cover"]
WSTEP = 100
wkm = list(range(0, int(TOTAL) + 1, WSTEP)) + ([TOTAL] if TOTAL % WSTEP else [])
series = {v: [] for v in VARS}; times = None; locs = []
for km in wkm:
    la, lo = pts[min(N - 1, int(round(km / STEP)))]
    q = urllib.parse.urlencode({"latitude": f"{la:.4f}", "longitude": f"{lo:.4f}", "start_date": START, "end_date": END,
                                "hourly": ",".join(VARS), "timezone": "Australia/Darwin", "wind_speed_unit": "ms"})
    d = get("https://archive-api.open-meteo.com/v1/archive?" + q, f"wx_{int(km):04d}.json")
    times = times or d["hourly"]["time"]; locs.append([round(km, 1), round(la, 3), round(lo, 3)])
    for v in VARS: series[v].append([None if x is None else (round(x, 1) if v in ("temperature_2m", "wind_speed_10m") else round(x)) for x in d["hourly"][v]])
with open(os.path.join(ROOT, "js", "data", "weather-2025.js"), "w", encoding="utf-8") as f:
    f.write('"use strict";\n/* 2025 年大会期間の実際の天気 (tools/fetch_real_data.py が作成)\n'
            ' 出典: Open-Meteo Historical Weather API (ERA5 / ERA5-Land 再解析, Copernicus Climate Change Service), CC BY 4.0\n'
            ' 時刻はオーストラリア中部標準時 (ACST, UTC+9:30) の毎正時。地点はルート上 100 km ごと\n'
            ' ghi=全天日射, dni=直達日射 (法線面), dhi=散乱日射 [W/m²], t=気温 [°C], ws=風速 10 m [m/s], wd=風向 [°, 吹いてくる方位], cc=雲量 [%] */\n')
    names = {"shortwave_radiation": "ghi", "direct_normal_irradiance": "dni", "diffuse_radiation": "dhi", "temperature_2m": "t", "wind_speed_10m": "ws", "wind_direction_10m": "wd", "cloud_cover": "cc"}
    f.write(f'const WEATHER_2025={{start:"{times[0]}",hours:{len(times)},loc:{json.dumps(locs)},\n')
    for v in VARS:
        f.write(f' {names[v]}:{json.dumps(series[v], separators=(",", ":"))},\n')
    f.write("};\n")
print("書き出し: js/data/weather-2025.js", os.path.getsize(os.path.join(ROOT, "js", "data", "weather-2025.js")) // 1024, "KB")
