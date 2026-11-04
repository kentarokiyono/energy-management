"""ルートノートの町の区間を OSM の実道路形状に差し替えるデータを作る.

1. overpass-api.de から町ごとに車道 (way[highway]) と信号ノードを取得 (--cache にキャッシュ)
2. TOWNS のチェックポイント (ノートの右左折・交差道路・CS 敷地) を順にたどって経路を探索
3. 経路の折れ線を隅切り (円弧フィレット) して曲率プログラム [長さ m, 曲率 1/m] に変換
4. js/data/route-osm.js に出力: 動作 km の差し替え・信号/ラウンドアバウト km・交差道路の向き

使い方:
  python3 tools/fetch_osm_towns.py --cache tools/osm-cache js/data/route-osm.js          # 全町
  python3 tools/fetch_osm_towns.py --cache tools/osm-cache --only "Tennant Creek" out.js
  python3 tools/fetch_osm_towns.py --offline --cache tools/osm-cache js/data/route-osm.js # キャッシュのみ
出力の照合表 (ノート km と OSM 距離の差・右左折角) を必ず確認すること。

チェックポイント (km はノートの Location Ref / route-plan.js の km):
  start: {"on": 道路, "near": 位置, "back": m, "from": 方位deg}  … 位置に最も近い「道路」のノードから from 方位へ back m 戻った所を起点
         {"near": 位置}                                           … 位置に最も近いノードを起点
  位置:  {"pt": [lat, lon]} / {"find": 名前の正規表現, "tag": "k=v"} / {"x": [道路A, 道路B]} (交差点)
  {"km", "turn": L|R|veerL|veerR|S|rab, "onto": 道路, "man": 動作km, "cs": n}  … 「道路」へ右左折 (rab: ラウンドアバウト経由)
  {"km", "cross": 道路}                                        … 交差道路を通過 (経路の曖昧さ解消用)
  {"km", "via": 位置, "leave": 動作km, "man": 動作km, "cs": n}  … 敷地等へ最短経路 (leave: 現在の道路を離れる点の動作)
  {"km", "end": true}                                          … 現在の道路を km まで直進して終了
  "lot": m … 右左折で敷地に入った後、m 進んで同じ道を戻る (敷地内 U ターン, "uturnMan": 折り返しの動作km)
  "bearing": deg … 右左折後の向き (北 0°, 東 90°) を ±45° に限定 (ラウンドアバウトの出口指定など)
  turn "merge" … 合流 (±90° の範囲なら可)
  道路は name/ref/alt_name/old_name に対する正規表現。"@service" = service/parking_aisle の道
  "anchor": true のチェックポイントはノート km をそのまま採用 (町の区間の km 基準点)
  "minGap": m … この距離未満の候補は無視 (既定はノート km 差の 0.5 倍)
"""
import argparse, heapq, json, math, os, re, sys, time, urllib.parse, urllib.request

OVERPASS = 'https://overpass-api.de/api/interpreter'
ENDPOINT = [OVERPASS]   # --endpoint で差し替え (例: https://overpass.private.coffee/api/interpreter)
UA = 'energy-management-route-tool/1.0 (BWSC simulator; route geometry)'
DRIVE = ('motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|'
         'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link')
CLASS_W = {'motorway': 1.0, 'trunk': 1.0, 'primary': 1.0, 'secondary': 1.15, 'tertiary': 1.3, 'unclassified': 1.6,
           'residential': 2.2, 'living_street': 3.0, 'road': 2.5, 'service': 4.0}
ARM_CLASSES = set(CLASS_W) - {'service'}

SH = r'^Stuart Highway$|(^|;)A87(;|$)'
TOWNS = [
    {'name': 'Darwin', 'bbox': [-12.480, 130.825, -12.435, 130.870], 'cps': [
        {'km': 0.0, 'start': {'near': {'find': r'^(State Square|Parliament House)', 'snap': 'service'}}, 'anchor': True},
        {'km': 0.06, 'turn': 'R', 'onto': '^Mitchell Street$', 'man': 0.06, 'minGap': 0},
        {'km': 0.30, 'cross': 'Cavenagh Street|Cavanagh Street'},
        {'km': 0.56, 'cross': 'McMinn Street'},
        {'km': 1.03, 'turn': 'R', 'onto': 'Garramilla Boulevard', 'man': 1.03},
        {'km': 2.00, 'end': True},
    ]},
    # CS1 は計量所 (OSM では名前なしの側道ループ): 左へ斜めに入り、約 300 m 先で本線へ戻る
    {'name': 'Katherine', 'bbox': [-14.560, 132.220, -14.420, 132.340], 'cps': [
        {'km': 321.30, 'start': {'on': SH, 'near': {'pt': [-14.4817259, 132.3236386]}, 'back': 500, 'from': 300}},
        {'km': 321.80, 'turn': 'veerL', 'onto': '@service', 'man': 321.80, 'anchor': True},
        {'km': 322.20, 'turn': 'merge', 'onto': SH, 'man': 322.20},
        {'km': 322.70, 'end': True},
    ]},
    {'name': 'Tennant Creek', 'bbox': [-19.675, 134.165, -19.620, 134.215], 'cps': [
        {'km': 987.20, 'start': {'on': SH + '|Paterson Street', 'near': {'x': [SH + '|Paterson Street', '^Kathleen Street$']}, 'back': 420, 'from': 0}},
        {'km': 987.62, 'turn': 'L', 'onto': '^Kathleen Street$', 'man': 987.62},
        {'km': 987.78, 'turn': 'R', 'onto': '^Weaber (Road|Street)$', 'man': 987.78},
        {'km': 987.92, 'turn': 'R', 'onto': '@service', 'man': 987.92, 'anchor': True},
        {'km': 988.12, 'turn': 'L', 'onto': SH + '|Paterson Street', 'man': 988.12},
        {'km': 988.50, 'end': True},
    ]},
    # 1498〜1505 は等倍ゾーン外 (zone: False) — 実形状は等倍ゾーン内だけで使う
    {'name': 'Alice Springs', 'bbox': [-23.815, 133.830, -23.680, 133.920], 'zone': False, 'cps': [
        {'km': 1493.50, 'start': {'on': SH, 'near': {'x': [SH, 'Wills Terrace']}, 'back': 500, 'from': 0}},
        {'km': 1494.00, 'cross': 'Wills Terrace'},
        {'km': 1495.00, 'cross': 'Stott Terrace'},
        {'km': 1495.85, 'turn': 'L', 'onto': 'Traeger Avenue', 'man': 1495.85},
        {'km': 1495.95, 'turn': 'R', 'onto': '@service', 'man': 1495.95, 'anchor': True},
        {'km': 1496.12, 'turn': 'L', 'onto': 'Speed Street', 'man': 1496.12},
        {'km': 1496.32, 'turn': 'R', 'onto': 'Gap Road', 'man': 1496.32},
        {'km': 1497.70, 'turn': 'rab', 'onto': SH, 'man': 1497.70},
        {'km': 1505.70, 'turn': 'R', 'onto': SH, 'man': 1505.70, 'minGap': 7500},
        {'km': 1506.20, 'end': True},
    ]},
    {'name': 'Coober Pedy', 'bbox': [-29.035, 134.725, -28.990, 134.775], 'cps': [
        {'km': 2179.50, 'start': {'on': SH, 'near': {'x': [SH, 'Hutchison Street|Hutchinson Street']}, 'back': 500, 'from': 330}},
        {'km': 2180.00, 'turn': 'L', 'onto': 'Hutchison Street|Hutchinson Street', 'man': 2180.00},
        {'km': 2180.85, 'turn': 'L', 'onto': '@service', 'man': 2180.85, 'anchor': True, 'lot': 60, 'uturnMan': 2181.02},
        {'km': 2181.12, 'turn': 'R', 'onto': 'Hutchison Street|Hutchinson Street', 'man': 2181.12},
        {'km': 2181.90, 'turn': 'L', 'onto': SH, 'man': 2181.90},
        {'km': 2182.30, 'end': True},
    ]},
    {'name': 'Glendambo', 'bbox': [-30.990, 135.720, -30.950, 135.780], 'cps': [
        {'km': 2432.50, 'start': {'on': SH, 'near': {'find': r'^Glendambo Roadhouse$'}, 'back': 1500, 'from': 310}},
        {'km': 2433.00, 'turn': 'L', 'onto': '^Glendambo Access Road$|^Glendambo Roadhouse$', 'man': 2433.00, 'minGap': 0},
        {'km': 2434.10, 'via': {'find': r'^Glendambo Roadhouse$', 'snap': 'service'}, 'cs': 8, 'anchor': True},
        {'km': 2434.20, 'turn': 'L', 'onto': SH, 'man': 2434.20, 'minGap': 400},
        {'km': 2434.70, 'end': True},
    ]},
    {'name': 'Port Augusta', 'bbox': [-32.520, 137.680, -32.440, 137.800], 'cps': [
        {'km': 2716.50, 'start': {'on': SH, 'near': {'x': [SH, r'\bA1\b|Highway One|Highway 1|Eyre Highway|Augusta Highway']}, 'back': 500, 'from': 330}},
        {'km': 2717.00, 'turn': 'L', 'onto': r'\bA1\b|Highway One|Highway 1|Augusta Highway', 'man': 2717.00},
        {'km': 2719.40, 'turn': 'L', 'onto': 'Flinders Terrace', 'man': 2719.40},
        {'km': 2719.80, 'turn': 'R', 'onto': 'Augusta Terrace', 'man': 2719.80},
        {'km': 2720.00, 'turn': 'R', 'onto': '@service', 'man': 2720.00, 'anchor': True, 'lot': 80, 'uturnMan': 2720.42},
        {'km': 2720.55, 'turn': 'R', 'onto': 'Augusta Terrace', 'man': 2720.55},
        {'km': 2720.80, 'turn': 'rab', 'onto': 'Carlton Parade|Calton Parade', 'man': 2720.80},
        {'km': 2721.00, 'turn': 'L', 'onto': 'Victoria Parade', 'man': 2721.00},
        {'km': 2721.50, 'end': True},
    ]},
    {'name': 'Adelaide', 'bbox': [-34.960, 138.580, -34.860, 138.650], 'cps': [
        {'km': 3019.10, 'start': {'on': '^Main North Road$', 'near': {'x': ['^Main North Road$', '^Regency Road$']}, 'back': 300, 'from': 0}},
        {'km': 3021.20, 'turn': 'veerR', 'onto': 'Main North Road', 'man': 3021.20},
        {'km': 3021.35, 'turn': 'L', 'onto': 'Robe Terrace', 'man': 3021.35},
        {'km': 3022.20, 'cross': 'Walkerville Terrace'},
        {'km': 3024.30, 'cross': 'North Terrace'},
        {'km': 3024.50, 'cross': 'Rundle Street'},
        {'km': 3025.07, 'cross': 'Bartels Road'},
        # Britannia Roundabout を右 (Wakefield Road 西行き)。Victoria Park 内への車道は OSM に無いので、
        # ゴール (3026.92) は公園北辺の Wakefield Road 上になる
        {'km': 3026.70, 'turn': 'rab', 'onto': '^Wakefield Road$', 'man': 3026.70, 'minGap': 0, 'bearing': 270, 'anchor': True},
        {'km': 3027.10, 'end': True},
    ]},
]

TURN_RANGE = {'merge': (-90, 90), 'L': (-160, -30), 'R': (30, 160), 'veerL': (-75, -6), 'veerR': (6, 75), 'S': (-25, 25), 'rab': (-180, 180)}


# ---------------- Overpass ----------------
def overpass(q, cache_path, offline):
    if cache_path and os.path.exists(cache_path):
        return json.load(open(cache_path, encoding='utf-8'))
    if offline:
        raise SystemExit(f'キャッシュがありません: {cache_path}')
    body = urllib.parse.urlencode({'data': q}).encode()
    for i in range(5):
        try:
            req = urllib.request.Request(ENDPOINT[0], data=body, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read().decode('utf-8'))
            if cache_path:
                os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                json.dump(d, open(cache_path, 'w', encoding='utf-8'))
            return d
        except Exception as e:  # 429/504/接続断はバックオフして再試行
            print(f'  overpass 失敗 ({e}) — {2 ** (i + 1)} 秒後に再試行', file=sys.stderr)
            time.sleep(2 ** (i + 1))
    raise SystemExit(f'{ENDPOINT[0]} から取得できませんでした')


def town_query(t):
    s, w, n, e = t['bbox']
    bb = f'{s},{w},{n},{e}'
    return (f'[out:json][timeout:180];'
            f'(way[highway~"^({DRIVE})$"]({bb}););out body;>;out skel qt;'
            f'node[highway=traffic_signals]({bb});out;'
            f'node[crossing=traffic_signals]({bb});out;'
            f'nwr[name]({bb})[~"^(amenity|leisure|landuse|tourism|shop|building|man_made|office|place|highway|historic)$"~"."];out center tags;')


# ---------------- グラフ ----------------
class Graph:
    def __init__(self, d, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = math.cos(math.radians(lat0)) * 111320.0
        self.ky = 110540.0
        self.xy, self.ways, self.adj, self.radj, self.node_ways = {}, {}, {}, {}, {}
        self.signals, self.ped, self.places = set(), set(), []
        for el in d['elements']:
            if el['type'] == 'node' and 'lat' in el:
                self.xy[el['id']] = self.proj(el['lat'], el['lon'])
        for el in d['elements']:
            tg = el.get('tags', {})
            if el['type'] == 'node':
                if tg.get('highway') == 'traffic_signals': self.signals.add(el['id'])
                if tg.get('crossing') == 'traffic_signals': self.ped.add(el['id'])
            if el['type'] == 'way' and 'highway' in tg and 'nodes' in el and re.match(f'^({DRIVE})$', tg['highway']):
                self.ways[el['id']] = el
            if 'name' in tg and el['type'] in ('node', 'way', 'relation') and not ('highway' in tg and el['type'] == 'way'):
                c = el.get('center') or ({'lat': el['lat'], 'lon': el['lon']} if 'lat' in el else None)
                if c: self.places.append((tg, self.proj(c['lat'], c['lon'])))
        for wid, w in self.ways.items():
            tg = w['tags']; ns = [n for n in w['nodes'] if n in self.xy]
            ow = tg.get('oneway'); rab = tg.get('junction') in ('roundabout', 'circular')
            fwd = True; bwd = not (ow in ('yes', 'true', '1') or rab or tg.get('highway') == 'motorway')
            if ow == '-1': fwd, bwd = False, True
            for a, b in zip(ns, ns[1:]):
                if fwd: self.adj.setdefault(a, []).append((b, wid)); self.radj.setdefault(b, []).append((a, wid))
                if bwd: self.adj.setdefault(b, []).append((a, wid)); self.radj.setdefault(a, []).append((b, wid))
            for n in ns: self.node_ways.setdefault(n, set()).add(wid)

    def proj(self, lat, lon):
        return ((lon - self.lon0) * math.cos(math.radians(self.lat0)) * 111320.0, (lat - self.lat0) * 110540.0)

    def dist(self, a, b):
        (x1, y1), (x2, y2) = self.xy[a], self.xy[b]
        return math.hypot(x2 - x1, y2 - y1)

    def bearing(self, a, b):
        (x1, y1), (x2, y2) = self.xy[a], self.xy[b]
        return math.degrees(math.atan2(x2 - x1, y2 - y1))

    def match(self, wid, pat):
        tg = self.ways[wid]['tags']
        if pat == '@service':
            return tg.get('highway') == 'service' or tg.get('service') == 'parking_aisle'
        if pat == '@any':
            return True
        return any(re.search(pat, tg.get(k, ''), re.I) for k in ('name', 'ref', 'alt_name', 'old_name', 'official_name'))

    def on(self, n, pat):
        return any(self.match(w, pat) for w in self.node_ways.get(n, ()))

    def degree(self, n):
        nb = set()
        for wid in self.node_ways.get(n, ()):
            ns = self.ways[wid]['nodes']
            for i, m in enumerate(ns):
                if m == n:
                    if i > 0: nb.add(ns[i - 1])
                    if i < len(ns) - 1: nb.add(ns[i + 1])
        return len(nb)

    def neighbours(self, n):
        """n に接続する全ての (隣接ノード, way) — 一方通行を無視 (交差道路の腕の列挙用)"""
        out = []
        for wid in self.node_ways.get(n, ()):
            ns = self.ways[wid]['nodes']
            for i, m in enumerate(ns):
                if m == n:
                    if i > 0 and ns[i - 1] in self.xy: out.append((ns[i - 1], wid))
                    if i < len(ns) - 1 and ns[i + 1] in self.xy: out.append((ns[i + 1], wid))
        return out

    def is_rab(self, wid):
        return self.ways[wid]['tags'].get('junction') in ('roundabout', 'circular')

    def wname(self, wid):
        tg = self.ways[wid]['tags']
        return tg.get('name') or tg.get('ref') or ''

    # ---- 位置 ----
    def locate(self, loc, prefer=None):
        if 'x' in loc:
            a, b = loc['x']
            cand = [n for n in self.node_ways if self.on(n, a) and self.on(n, b)]
            if not cand: raise LookupError(f'交差点が見つからない: {a} × {b}')
            return cand, None
        if 'pt' in loc:
            p = self.proj(*loc['pt'])
        else:
            k, v = (loc.get('tag', '=').split('=', 1) + [''])[:2]
            hits = [(tg, p) for tg, p in self.places if re.search(loc['find'], tg.get('name', ''), re.I) and (not k or tg.get(k) == v)]
            if not hits: raise LookupError(f'名前が見つからない: {loc["find"]} {loc.get("tag", "")}')
            if len(hits) > 1:
                print('    候補: ' + ' / '.join(tg.get('name', '') for tg, _ in hits[:6]))
            p = hits[0][1]
        return None, p

    def nearest(self, p, pat=None, snap=None):
        best, bd = None, 1e18
        for n, ws in self.node_ways.items():
            if pat and not self.on(n, pat): continue
            if not any(m for m, _ in self.adj.get(n, [])): continue
            x, y = self.xy[n]; d = (x - p[0]) ** 2 + (y - p[1]) ** 2
            if snap == 'service' and not self.on(n, '@service'): d = d * 1.0 + 40.0 ** 2
            if d < bd: bd, best = d, n
        if best is None: raise LookupError('近くに道路ノードがない')
        return best, math.sqrt(bd)


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


# ---------------- 経路探索 ----------------
def dijkstra(G, src, prev, cur, forced=None, service_w=None, max_d=15000):
    """src からの最短経路木 {node: (コスト, 実距離, 直前ノード, way)}。cur の道路を優先し、直前ノードへは戻らない。"""
    out = {src: (0.0, 0.0, None, None)}
    pq = []
    def relax(n, c, L, pn):
        for m, wid in G.adj.get(n, []):
            if m == pn or m in out: continue
            tg = G.ways[wid]['tags']
            w = CLASS_W.get(tg.get('highway', '').replace('_link', ''), 2.0)
            if tg.get('highway') == 'service' and service_w: w = service_w
            if cur and G.match(wid, cur): w *= 0.45
            if G.is_rab(wid): w = min(w, 1.0)
            d = G.dist(n, m)
            heapq.heappush(pq, (c + d * w, L + d, m, n, wid))
    if forced:
        nxt, wid = forced
        heapq.heappush(pq, (0.0, G.dist(src, nxt), nxt, src, wid))
    else:
        relax(src, 0.0, 0.0, prev)
    while pq:
        c, L, n, pn, pw = heapq.heappop(pq)
        if n in out: continue
        out[n] = (c, L, pn, pw)
        if L <= max_d: relax(n, c, L, pn)
    return out


def trace(D, n, src):
    path = [n]
    while n != src:
        n = D[n][2]; path.append(n)
        if len(path) > 100000: raise RuntimeError('経路が循環')
    return path[::-1]


def follow(G, n, prev, pat, length, forced=None):
    """pat の道路を最も直進に近い向きで length m たどる"""
    path = [n]; L = 0.0; pn = prev
    if forced:
        path.append(forced[0]); L += G.dist(n, forced[0]); pn, n = n, forced[0]
    while L < length:
        opts = [(m, w) for m, w in G.adj.get(n, []) if m != pn]
        if not opts: break
        b_in = G.bearing(pn, n) if pn is not None else None
        def key(o):
            m, w = o
            a = abs(wrap(G.bearing(n, m) - b_in)) if b_in is not None else 0
            return (0 if G.match(w, pat) else 1, a)
        m, w = min(opts, key=key)
        L += G.dist(n, m); pn, n = n, m; path.append(n)
    return path, L


def walk_back(G, n, pat, length, from_deg):
    """n へ進入してくる向きに pat の道路を length m 遡る (一方通行に従う) → 起点からの順の経路"""
    path = [n]; L = 0.0; nx = None; b = from_deg
    while L < length:
        opts = [(m, w) for m, w in G.radj.get(n, []) if m != nx]
        if not opts: break
        def key(o):
            m, w = o
            return (0 if G.match(w, pat) else 1, abs(wrap(G.bearing(n, m) - b)))
        m, w = min(opts, key=key)
        b = G.bearing(n, m); L += G.dist(n, m); nx, n = n, m; path.append(n)
    return path[::-1]


def pick_start(G, cand, pat, from_deg):
    """交差点候補 (上下線で複数) のうち、from 方位から pat の道路で進入できるノード"""
    def score(n):
        best = 1e9
        for m, w in G.radj.get(n, []):
            if G.match(w, pat): best = min(best, abs(wrap(G.bearing(n, m) - from_deg)))
        return best
    return min(cand, key=score)


def route_town(G, t):
    """チェックポイントを順にたどる → (経路ノード列, 各チェックポイントの記録, 照合ログ)"""
    cps = t['cps']
    st = cps[0]['start']
    cand, p = G.locate(st['near'])
    if 'on' in st:
        n0 = pick_start(G, cand, st['on'], st.get('from', 0)) if cand else G.nearest(p, st['on'])[0]
        wb = walk_back(G, n0, st['on'], st.get('back', 400), st.get('from', 0))
        path = [wb[0]]; cur = st['on']
        forced = (wb[1], G_edge_way(G, wb[0], wb[1])) if len(wb) > 1 else None
    else:
        n0 = cand[0] if cand else G.nearest(p, None, st['near'].get('snap'))[0]
        path = [n0]; cur = None; forced = None
    marks = [{'cp': cps[0], 'i': 0}]
    log = []
    after_via = False; back_at_src = False; prev_km = cps[0]['km']
    for cp in cps[1:]:
        gap = (cp['km'] - prev_km) * 1000.0
        pat = cp.get('onto') or cp.get('cross')
        min_gap = cp.get('minGap', max(0.0, gap * (0.3 if pat == '@service' else 0.5)))
        src = path[-1]
        prev = None if after_via or len(path) < 2 else path[-2]
        L0 = plen(G, path)
        if cp.get('end'):
            seg, _ = follow(G, src, prev, cur or '@any', max(gap, 50.0), forced)
            path += seg[1:]; forced = None
            marks.append({'cp': cp, 'i': len(path) - 1})
            log.append(f"  {cp['km']:8.2f} end      OSM {plen(G, path) - L0:6.0f} m / ノート {gap:6.0f} m")
            break
        if 'via' in cp:
            cand, p = G.locate(cp['via'])
            tgt = cand[0] if cand else G.nearest(p, None, cp['via'].get('snap'))[0]
            D = dijkstra(G, src, prev, cur, forced, service_w=1.6)
            if tgt not in D: raise LookupError(f'到達不能: via {cp["via"]}')
            seg = trace(D, tgt, src)
            base = len(path) - 1
            mk = {'cp': cp}
            if cur:
                for k in range(1, len(seg)):
                    w = G_edge_way(G, seg[k - 1], seg[k])
                    if w is not None and not G.match(w, cur): mk['leave_i'] = base + k - 1; break
            path += seg[1:]
            mk['i'] = len(path) - 1
            marks.append(mk)
            forced = None; after_via = True; cur = '@service'
            log.append(f"  {cp['km']:8.2f} via      OSM {plen(G, path) - L0:6.0f} m / ノート {gap:6.0f} m")
            prev_km = cp['km']; continue
        D = dijkstra(G, src, prev, cur, forced)
        if back_at_src and len(path) > 1:   # 敷地で折り返して入口に戻った直後: 入口の交差点自体が候補
            D[src] = (0.0, 0.0, path[-2], G_edge_way(G, path[-2], src))
            min_gap = 0.0
        best = None   # (実距離, ノード, 次の辺, 転向角)
        for n, (c, L, pn, pw) in D.items():
            if (n == src and not back_at_src) or pn is None or L < min_gap or not G.on(n, pat): continue
            if best is not None and L >= best[0]: continue
            if 'cross' in cp:   # 交差道路を直進で通過: 同じ道路で最も直進に近い辺へ続ける
                if G.degree(n) < 3 or G.match(pw, pat): continue
                b_in = G.bearing(pn, n); opts = []
                for m, w in G.adj.get(n, []):
                    if m == pn or G.match(w, pat): continue
                    a = wrap(G.bearing(n, m) - b_in)
                    if abs(a) <= 35: opts.append((0 if G.wname(w) == G.wname(pw) else 1, abs(a), m, w, a))
                if opts:
                    o = min(opts); best = (L, n, (o[2], o[3]), o[4])
                continue
            tr = cp['turn']; lo, hi = TURN_RANGE[tr]
            if tr == 'rab':
                if not G.is_rab(pw): continue
            else:
                if G.degree(n) < 3: continue
                if G.match(pw, pat) and not (cur and G.match(pw, cur)): continue   # 既に目的の道路上
            b_in = G.bearing(pn, n)
            for m, w in G.adj.get(n, []):
                if m == pn or not G.match(w, pat) or (tr == 'rab' and G.is_rab(w)): continue
                a = wrap(G.bearing(n, m) - b_in)
                if 'bearing' in cp and abs(wrap(G.bearing(n, m) - cp['bearing'])) > 45: continue   # 出口の絶対方位 (北 0°, 東 90°)
                if lo <= a <= hi and (best is None or L < best[0]): best = (L, n, (m, w), a)
        if best is None:
            G.partial = (path, marks, log)   # 診断用
            raise LookupError(f'候補なし: {cp}')
        L, n, fo, a = best
        seg = trace(D, n, src) if n != src else [src]
        back_at_src = False
        base = len(path) - 1
        path += seg[1:]
        mk = {'cp': cp, 'i': len(path) - 1, 'ang': a}
        if cp.get('turn') == 'rab':
            for k in range(1, len(seg)):
                w = G_edge_way(G, seg[k - 1], seg[k])
                if w is not None and G.is_rab(w): mk['rab_i'] = base + k - 1; break
        marks.append(mk)
        forced = fo; after_via = False
        if fo and 'cross' not in cp: cur = pat
        if cp.get('lot') and fo:   # 敷地に入って lot m 進み、同じ道を戻って入口へ (敷地内 U ターン)
            seg, _ = follow(G, path[-1], path[-2] if len(path) > 1 else None, '@service', cp['lot'], fo)
            path += seg[1:] + seg[-2::-1]
            mk['uturn_i'] = len(path) - len(seg)
            forced = None; back_at_src = True
        kind = cp.get('turn') or 'cross'
        log.append(f"  {cp['km']:8.2f} {kind:8s} OSM {L:6.0f} m / ノート {gap:6.0f} m  角度 {a:+5.0f}°  {pat}")
        prev_km = cp['km']
    if forced:   # 最後が右左折なら、その先の辺を 1 本足しておく
        path.append(forced[0])
    return path, marks, log


def G_edge_way(G, a, b):
    for m, w in G.adj.get(a, []):
        if m == b: return w
    for m, w in G.neighbours(a):
        if m == b: return w
    return None


def plen(G, path):
    return sum(G.dist(a, b) for a, b in zip(path, path[1:]))


# ---------------- 隅切り → 曲率プログラム ----------------
def _uturn_shape(r1=8.0, r2=10.0):
    """左 α (半径 r1) → 右 180+2α (半径 r2) → 左 α。横ずれ 0 で元の道に戻る α を二分法で求める"""
    def lat(al):
        x = h = 0.0
        for ang, rad in ((-al, r1), (math.pi + 2 * al, r2), (-al, r1)):
            n = 400; L = abs(ang) * rad; k = math.copysign(1 / rad, ang)
            for _ in range(n): h += k * L / n; x += math.sin(h) * L / n
        return x
    lo, hi = 0.2, 1.5
    for _ in range(50):
        m = (lo + hi) / 2
        if lat(m) > 0: lo = m
        else: hi = m
    al = (lo + hi) / 2
    return (al, r1), (math.pi + 2 * al, r2), (al, r1)


UTURN = _uturn_shape()


def fillet(G, path):
    """折れ線 → [(len, k)] と 各頂点の距離 (隅切り後)・各頂点の入射方位 (町の座標系, rad)"""
    pts = [G.xy[n] for n in path]
    # 重複/極短辺を除く (頂点 index の対応は keep で保持)
    keep = [0]
    for i in range(1, len(pts)):
        if math.dist(pts[i], pts[keep[-1]]) > 0.5: keep.append(i)
    P = [pts[i] for i in keep]
    nseg = len(P) - 1
    seg_len = [math.dist(P[i], P[i + 1]) for i in range(nseg)]
    brg = [math.atan2(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) for i in range(nseg)]
    b0 = brg[0]
    # 頂点ごとの転向角 (右 +)。折り返し (|θ|>170°) は右回り U ターン
    th = [0.0] * len(P)
    for i in range(1, nseg):
        d = (brg[i] - brg[i - 1] + math.pi) % (2 * math.pi) - math.pi
        if abs(d) > math.radians(170): d = math.pi
        th[i] = d
    # 隅切り半径: 交差点級の転向は 12 m、それ以外は辺長の半分が許す限り大きく
    tan_len = [0.0] * len(P); rad = [0.0] * len(P); uturn = [False] * len(P)
    for i in range(1, nseg):
        a = abs(th[i])
        if a < 1e-4: continue
        if a >= math.pi - 1e-6: uturn[i] = True; continue
        Rmax = 12.0 if a > math.radians(35) else 600.0
        avail = min(seg_len[i - 1] * (1.0 if i == 1 else 0.5), seg_len[i] * (1.0 if i == nseg - 1 else 0.5))
        r = min(Rmax, avail / math.tan(a / 2))
        rad[i] = r; tan_len[i] = r * math.tan(a / 2)
    prog = []; vdist = [0.0] * len(P); hin = [b0] * len(P)
    D = 0.0; H = 0.0
    def put(L, k):
        nonlocal D, H
        if L <= 1e-6: return
        if prog and abs(prog[-1][1] - k) < 1e-9: prog[-1][0] += L
        else: prog.append([L, k])
        D += L; H += L * k
    for i in range(nseg):
        # 辺 i の直線部 (両端の円弧の接線長を除く) → 頂点 i+1 の円弧
        put(max(0.0, seg_len[i] - tan_len[i] - tan_len[i + 1]), 0.0)
        j = i + 1
        if j < nseg:
            hin[j] = H
            if uturn[j]:   # 敷地内の折り返し: 左へ振ってから右回りのバルブで同じ道へ戻る
                (al, r1), (bl, r2), _ = UTURN
                vdist[j] = D + al * r1 + bl * r2 / 2
                put(al * r1, -1 / r1); put(bl * r2, 1 / r2); put(al * r1, -1 / r1)
            elif rad[j] > 0:
                arc = rad[j] * abs(th[j]); vdist[j] = D + arc / 2
                put(arc, math.copysign(1 / rad[j], th[j]))
            else:
                vdist[j] = D
    vdist[-1] = D; hin[-1] = H
    # 元の path index → 隅切り後の距離・入射方位
    full_d = [0.0] * len(path); full_h = [0.0] * len(path)
    ki = 0
    for i in range(len(path)):
        while ki + 1 < len(keep) and keep[ki + 1] <= i: ki += 1
        full_d[i] = vdist[ki]; full_h[i] = hin[ki]
    return prog, full_d, full_h, b0, D


def town_frame_heading(D_prog, prog, d):
    """曲率プログラム上の距離 d での方位 (町の座標系 rad)"""
    acc = 0.0; H = 0.0
    for L, k in prog:
        if d <= acc + L: return H + (d - acc) * k
        acc += L; H += L * k
    return H


def build_town(G, t):
    path, marks, log = route_town(G, t)
    prog, vd, vh, b0, total = fillet(G, path)
    anchor = next((m for m in marks if m['cp'].get('anchor')), marks[1] if len(marks) > 1 else marks[0])
    km0 = anchor['cp']['km'] - vd[anchor.get('rab_i', anchor['i'])] / 1000.0
    kmof = lambda i: round(km0 + vd[i] / 1000.0, 4)
    man, cs, extra = {}, {}, {}
    on_path = {}
    for i, n in enumerate(path): on_path.setdefault(n, []).append(i)
    for m in marks:
        cp = m['cp']; i = m.get('rab_i', m['i'])
        if cp.get('man') is not None:
            man[f"{cp['man']:g}"] = [kmof(i), round(vh[i], 4)]
        if cp.get('uturnMan') is not None and 'uturn_i' in m:
            ui = m['uturn_i']; man[f"{cp['uturnMan']:g}"] = [kmof(ui), round(vh[ui], 4)]
        if cp.get('leave') is not None and 'leave_i' in m:
            li = m['leave_i']; man[f"{cp['leave']:g}"] = [kmof(li), round(vh[li], 4)]
        if cp.get('cs') is not None:
            cs[str(cp['cs'])] = kmof(m['i']) if 'via' in cp else None
        if cp.get('finish'):
            extra['finish'] = kmof(m['i'])
    # 信号・歩行者信号・ラウンドアバウト入口
    def near_path(nodes, rmax=30.0):
        out = []
        for s in nodes:
            if s in on_path: out.append(kmof(on_path[s][0])); continue
            x, y = G.xy[s]; bd, bi = 1e9, None
            for i, n in enumerate(path):
                d = math.hypot(G.xy[n][0] - x, G.xy[n][1] - y)
                if d < bd: bd, bi = d, i
            if bd <= rmax: out.append(kmof(bi))
        out.sort(); res = []
        for k in out:
            if not res or k - res[-1] > 0.04: res.append(k)
        return res
    sig = near_path(G.signals); ped = near_path(G.ped - G.signals)
    rab = []
    for k in range(1, len(path)):
        w = G_edge_way(G, path[k - 1], path[k]); w0 = G_edge_way(G, path[k - 2], path[k - 1]) if k > 1 else None
        if w is not None and G.is_rab(w) and not (w0 is not None and G.is_rab(w0)): rab.append(kmof(k - 1))
    # 交差道路の腕 (経路外の車道・名前付き or 主要道路)
    arms = []
    used = set()
    for a_, b_ in zip(path, path[1:]): used.add((a_, b_)); used.add((b_, a_))
    for i, n in enumerate(path):
        for nb, w in G.neighbours(n):
            if (n, nb) in used: continue   # 経路自身が通る辺 (2 回目の通過を含む)
            tg = G.ways[w]['tags']; hw = tg.get('highway', '').replace('_link', '')
            if hw not in ARM_CLASSES and not G.is_rab(w) and not tg.get('name'): continue
            b = math.radians(G.bearing(n, nb)) - b0
            arms.append([kmof(i), round(b, 4), G.wname(w)[:22]])
    arms.sort(key=lambda a: a[0])
    flat = [v for L, k in prog for v in (round(L, 2), round(k, 6))]
    out = {'name': t['name'], 'km0': round(km0, 4), 'len': round(total, 1), 'zone': t.get('zone', True),
           'prog': flat, 'man': man, 'sig': sig, 'ped': ped, 'rab': rab, 'arms': arms}
    if cs: out['cs'] = {k: v for k, v in cs.items() if v is not None}
    out.update(extra)
    return out, log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--cache', default=None)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--only', default=None)
    ap.add_argument('--endpoint', default=OVERPASS, help='Overpass API の URL (ミラー可)')
    a = ap.parse_args()
    ENDPOINT[0] = a.endpoint
    res = []
    for t in TOWNS:
        if a.only and t['name'] != a.only: continue
        print(f"== {t['name']}")
        cp = os.path.join(a.cache, re.sub(r'\W+', '_', t['name']).lower() + '.json') if a.cache else None
        d = overpass(town_query(t), cp, a.offline)
        s, w, n, e = t['bbox']
        G = Graph(d, (s + n) / 2, (w + e) / 2)
        try:
            town, log = build_town(G, t)
        except LookupError as ex:
            print(f'  失敗: {ex} — この町は手続き生成のまま'); continue
        print('\n'.join(log))
        print(f"  区間 {town['km0']:.3f}–{town['km0'] + town['len'] / 1000:.3f} km ({town['len']:.0f} m)  "
              f"動作 {len(town['man'])}  信号 {len(town['sig'])}  RAB {len(town['rab'])}  交差道路 {len(town['arms'])}")
        for k, v in town['man'].items():
            print(f"    動作 {k:>8s} → {v[0]:.3f}  (差 {v[0] - float(k):+.3f} km)")
        res.append(town)
        time.sleep(1.0 if a.offline else 5.0)
    js = ('"use strict";\n/* OSM (© OpenStreetMap contributors, ODbL) の道路形状 — tools/fetch_osm_towns.py で生成\n'
          ' prog: [長さ m, 曲率 1/m] の並び (右 +)。man: {ノートkm: [km, 進入方位rad, 曲がり損ね角deg]}\n'
          ' arms: [km, 方位rad(町の座標系), 名前] */\n'
          'const OSM_TOWNS=' + json.dumps(res, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(a.out, 'w', encoding='utf-8').write(js)
    print(f'{len(res)} 町 → {a.out}')


if __name__ == '__main__':
    main()
