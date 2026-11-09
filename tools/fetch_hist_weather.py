#!/usr/bin/env python3
"""過去 21 年 (2005〜2025 年) の大会時期の天気 → js/data/weather-hist.js (傾向タブで使うときだけ読み込む)

 出典: Open-Meteo Historical Weather API (ERA5 / ERA5-Land 再解析, Copernicus Climate Change Service), CC BY 4.0
 期間: 各年 8/22 0 時〜9/1 23 時 (オーストラリア中部時間, 264 時間)。地点: js/data/weather-2025.js と同じ (ルート上 100 km ごと)
 項目: dni=直達日射 (法線面), dhi=散乱日射 [W/m²], t=気温 [°C], ws=風速 10 m [m/s], wd=風向 [°], cc=雲量 [%], wg=最大瞬間風速 10 m [m/s]
 使い方: python3 tools/fetch_hist_weather.py   (キャッシュ: tools/real-cache/)
"""
import json, os, re, sys, time, hashlib, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "real-cache")
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "bwsc-sim-data-tool/1.0"}
YEARS = list(range(2005, 2026))
VARS = ["direct_normal_irradiance", "diffuse_radiation", "temperature_2m", "wind_speed_10m", "wind_direction_10m", "cloud_cover", "wind_gusts_10m"]
NAMES = {"direct_normal_irradiance": "dni", "diffuse_radiation": "dhi", "temperature_2m": "t", "wind_speed_10m": "ws", "wind_direction_10m": "wd", "cloud_cover": "cc", "wind_gusts_10m": "wg"}

def get(url, name):
    p = os.path.join(CACHE, name.replace(".json", "_" + hashlib.sha1(url.encode()).hexdigest()[:10] + ".json"))
    if os.path.exists(p):
        return json.load(open(p))
    for k in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = json.load(r)
            json.dump(d, open(p, "w"))
            time.sleep(2)
            return d
        except Exception as e:
            print("  retry", k, e, file=sys.stderr); time.sleep(min(60, 2 ** k))
    raise SystemExit("取得できませんでした: " + url)

# 地点は 2025 年のデータと同じ
src = open(os.path.join(ROOT, "js", "data", "weather-2025.js"), encoding="utf-8").read()
locs = json.loads(re.search(r"loc:(\[\[.*?\]\])", src).group(1))
out = {}
for y in YEARS:
    ser = {NAMES[v]: [] for v in VARS}
    # 31 地点を 1 回の問い合わせで (年ごとに 1 回)
    q = urllib.parse.urlencode({"latitude": ",".join(f"{l[1]:.4f}" for l in locs), "longitude": ",".join(f"{l[2]:.4f}" for l in locs), "start_date": f"{y}-08-22", "end_date": f"{y}-09-01",
                                "hourly": ",".join(VARS), "timezone": "Australia/Darwin", "wind_speed_unit": "ms"})
    D = get("https://archive-api.open-meteo.com/v1/archive?" + q, f"histm_{y}.json")
    for d in D:
        for v in VARS:
            ser[NAMES[v]].append([None if x is None else (round(x, 1) if v in ("temperature_2m", "wind_speed_10m", "wind_gusts_10m") else round(x)) for x in d["hourly"][v]])
    out[y] = ser
    print(y, "ok", flush=True)
with open(os.path.join(ROOT, "js", "data", "weather-hist.js"), "w", encoding="utf-8") as f:
    f.write('"use strict";\n/* 過去 21 年 (2005〜2025 年) の大会時期の天気 (tools/fetch_hist_weather.py が作成)\n'
            ' 出典: Open-Meteo Historical Weather API (ERA5 / ERA5-Land 再解析, Copernicus Climate Change Service), CC BY 4.0\n'
            ' 各年 8/22 0 時から 264 時間 (オーストラリア中部時間, 毎正時)。地点は weather-2025.js と同じ (ルート上 100 km ごと)\n'
            ' dni=直達日射 (法線面), dhi=散乱日射 [W/m²], t=気温 [°C], ws=風速 10 m [m/s], wd=風向 [°, 吹いてくる方位], cc=雲量 [%], wg=最大瞬間風速 10 m [m/s] */\n')
    f.write(f'var WEATHER_HIST={{hours:264,loc:{json.dumps(locs)},years:{{\n')
    for y in YEARS:
        f.write(f' {y}:{json.dumps(out[y], separators=(",", ":"))},\n')
    f.write("}};\n")
print("書き出し: js/data/weather-hist.js", os.path.getsize(os.path.join(ROOT, "js", "data", "weather-hist.js")) // 1024, "KB")
