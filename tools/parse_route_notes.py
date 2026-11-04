"""BWSC 2025 Route Notes (V1.0, 13 July 2025) のテキストを構造化する.

入力: pdftotext -layout で抽出したテキスト
出力: JSON 配列 [{km, km2?, text, cols:[feature, action, note]}] (km 昇順)
使い方: pdftotext -layout RouteNotes.pdf rn.txt && python3 tools/parse_route_notes.py rn.txt js/data/route-2025.js
"""
import json, re, sys

KM_RE = re.compile(r'^\s{0,6}(\d{1,4}(?:\.\d{1,2})?)(?:\s*-\s*(\d{1,4}(?:\.\d+)?))?\s{2,}(\S.*)$')
SKIP = re.compile(r'Location Ref|\(Approx km|Start\)\s*$|^\s*\d{1,2}\s*$|t/o = (TURN|turn)|Sector \d|DRIVE ON THE LEFT|CHANGE DRIVERS|BEWARE OF FATIGUE|'
                  r'DRIVE CAREFULLY|NO CONVOYS|GIVE ROOM TO|DUAL CARRIAGEWAYS|SAFETY – FIRST|km/h = Speed Limit|KEEP LEFT UNLESS')

# 誤植の補正 (前後の km と矛盾するもの)
FIX = {('898', 'Sign: TT310'): 989, ('8215', 'Speed Limit 110'): 2815, ('1994', 'Welcome to'): 1794,
       ('1662', 'Floodway'): 1562, ('1523', 'Airstrip'): 1623}


def parse(lines):
    rows = []
    last = None
    for ln in lines:
        if not ln.strip() or SKIP.search(ln):
            last = None if not ln.strip() else last
            continue
        m = KM_RE.match(ln)
        if m:
            km, km2, rest = m.group(1), m.group(2), m.group(3)
            cols = [c.strip() for c in re.split(r'\s{2,}', rest) if c.strip()]
            text = ' '.join(cols)
            for (k, frag), v in FIX.items():
                if km == k and frag in text:
                    km = str(v)
            r = {'km': float(km), 'text': text, 'cols': cols}
            if km2:
                r['km2'] = float(km2)
            rows.append(r)
            last = r
        elif last is not None and len(ln) - len(ln.lstrip()) > 8 and not re.search(r'Control Stop|Open:|Close', ln):
            extra = ' '.join(c.strip() for c in re.split(r'\s{2,}', ln.strip()) if c.strip())
            if extra and len(extra) < 80:
                last['text'] += ' ' + extra
    rows.sort(key=lambda r: r['km'])
    return rows





# ---------------- 分類 ----------------
def classify(r):
    t = r['text']; tl = t.lower()
    out = []
    m = re.search(r'Speed\s*(?:Limit)?\s*(?:Sign:)?\s*(\d{2,3})\s*(?:km)?', t, re.I)
    if m and 'ahead' not in tl and not re.search(r'Average Speed', t) and int(m.group(1)) in (10, 25, 40, 50, 60, 70, 80, 90, 100, 110, 130):
        if not re.search(r'Speed\s*Limit\s*10\s*km', t):          # 1360 "Speed Limit 10 km/h" は誤植扱い
            out.append(('limit', int(m.group(1))))
    if re.search(r'Pedestrian (crossing|lights)', t, re.I): out.append(('pedlight', None))
    elif re.search(r'Traffic\s*Light|traffic lights|Lights\b', t, re.I) and not re.search(r'Pedestrian|Toilets', t): out.append(('signal', None))
    if re.search(r'round\s*about|roundabout', tl): out.append(('roundabout', None))
    if re.search(r'cattle\s*g(ri|ir)d|\bgrid\b|Double cattle grid', tl): out.append(('grid', None))
    if re.search(r'floodway', tl): out.append(('floodway', None))
    if re.search(r'bridge', tl) and 'overpass bridge' not in tl and 'railway bridge' not in tl and 'rail crossing' not in tl:
        out.append(('river' if re.search(r'creek|river|channel', tl) else 'bridge', None))
    if re.search(r'railway|rail crossing|rail overpass|bridge over train|rails/bridge|the ghan', tl): out.append(('rail', None))
    if re.search(r'overtaking lane (starts|begins)', tl): out.append(('otl_start', None))
    if re.search(r'overtaking lane ends|overtaking land ends|overtaking lane end\b', tl): out.append(('otl_end', None))
    if re.search(r'road\s*works|roadworks', tl) and 'end of road' not in tl: out.append(('works', None))
    if re.search(r'end of road\s*works', tl): out.append(('works_end', None))
    if re.search(r'no lines|loose gravel', tl): out.append(('gravel', None))
    if re.search(r'rest area|parking bay|truck (rest|parking|bay|stop)|camp|flat area|parking area', tl): out.append(('bay', 'R' if re.search(r'on right|right (hand )?side|right$', tl) else 'L'))
    if re.search(r'radio tower', tl): out.append(('tower', 'R' if 'right' in tl else 'L'))
    if re.search(r'solar panels', tl): out.append(('solarfarm', 'R' if 'right' in tl else 'L'))
    if re.search(r'highway mar?ker', tl):
        n = re.search(r'mar?ker\s*(\d+)', tl); out.append(('hwmarker', int(n.group(1)) if n else None))
    m2 = re.search(r'Sign:?\s*([A-Z]{1,2})\s?(\d{1,3})\b', t)
    if m2 and 'Speed' not in t: out.append(('distsign', m2.group(1) + ' ' + m2.group(2)))
    elif re.search(r'Sign:\s*CREST', t): out.append(('warn', 'CREST'))
    elif re.search(r'wandering stock|stock on highway|cattle next', tl): out.append(('warn', 'cow'))
    elif re.search(r'flood (warning|level|marker)', tl): out.append(('warn', 'FLOOD'))
    # 脇道 (t/o)
    if re.search(r't/o|turn off on|exit on left|exit on right|side road|road junction on left|track on right', tl) and not re.search(r'turn left|turn right', tl):
        side = 'R' if re.search(r't/o\s*(on\s*)?right|exit on right|on right|right side|t/o right|track on right', tl) else 'L'
        out.append(('sideroad', side))
    if re.search(r'\b(roadhouse|fuel|services|pub)\b', tl) and not out: out.append(('services', None))
    return out


def build(rows):
    ev = []
    for r in rows:
        for kind, val in classify(r):
            km = r['km']
            if kind == 'signal' and 'Waterloo' in r['text']:
                km = 3003.0   # 「Traffic lights, Waterloo Corner Road」行(3003)が 2999 行に連結されるため
            e = {'km': km, 'k': kind, 't': r['text'][:90]}
            if val is not None: e['v'] = val
            if 'km2' in r: e['km2'] = r['km2']
            ev.append(e)
    return ev


if __name__ == '__main__':
    rows = parse(open(sys.argv[1], encoding='utf-8').read().split('\n'))
    ev = build(rows)
    js = ('"use strict";\n/* BWSC 2025 Route Notes V1.0 (13 July 2025) から自動生成 — tools/parse_route_notes.py */\n'
          'const RN_ROWS=' + json.dumps([[r['km'], r['text'][:110]] for r in rows], ensure_ascii=False, separators=(',', ':')) + ';\n'
          'const RN_EVENTS=' + json.dumps(ev, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(sys.argv[2], 'w', encoding='utf-8').write(js)
    import collections
    print(len(rows), 'rows', len(ev), 'events', dict(collections.Counter(e['k'] for e in ev)))
