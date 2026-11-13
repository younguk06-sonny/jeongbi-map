"""경기도 '일반 정비사업 추진현황'(경기데이터드림) CSV → site/data/zones/gg.json
 - 국토부 정비구역(경계 있음)과 이름·면적으로 맞춰 진행단계·인가일을 덧입힘
 - 맞는 경계가 없는 구역(대부분 정비예정구역)은 주소·면적만 담아 지도에서 원으로 표시
사용: python3 scripts/build_gg.py scripts/src/gg_jeongbi.csv"""
import csv, json, os, re, sys, collections
ROOT = os.path.join(os.path.dirname(__file__), '..', 'site', 'data')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'src', 'gg_jeongbi.csv')
rows = list(csv.DictReader(open(src, encoding='utf-8')))
meta = json.load(open(os.path.join(ROOT, 'meta.json')))
zidx = json.load(open(os.path.join(ROOT, 'zones', 'index.json')))

STAGE = {'예정구역': '정비예정구역', '정비구역': '구역 지정', '추진위원회': '추진위 구성', '조합설립': '조합설립인가', '사업시행': '사업시행인가',
         '관리처분': '관리처분인가', '착공': '착공', '준공': '준공', '청산': '준공(청산)'}
DATES = [('정비예정구역고시일자', '예정구역 고시'), ('정비구역지정일자(최초지정)', '구역 지정'), ('추진위승인일자', '추진위 승인'), ('안전진단일자', '안전진단'),
         ('조합설립인가일자', '조합설립인가'), ('사업시행인가일자', '사업시행인가'), ('관리처분인가일자', '관리처분인가'), ('착공일자', '착공'),
         ('일반분양일자', '일반분양'), ('준공일자', '준공'), ('이전고시일자', '이전고시')]
ROMAN = str.maketrans({'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5', 'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10', '－': '-', '‐': '-'})
def norm(s):
    s = (s or '').translate(ROMAN)
    s = re.sub(r'\(.*?\)', '', s)
    s = re.sub(r'\s|주택|재개발|재건축|정비사업|정비구역|정비|사업|주거환경개선|구역|지구|아파트|일원|주변|일대|번지|·|,', '', s)
    return s.lower()

# 시군명 → 정비구역 파일 코드(시 단위 5자리)
city_codes = collections.defaultdict(set)
for c, v in meta['codes'].items():
    if c.startswith('41'): city_codes[v['n']].add(c[:4] + '0')
zones = {}
for code in {c for s in city_codes.values() for c in s}:
    p = os.path.join(ROOT, 'zones', code + '.json')
    if os.path.exists(p): zones[code] = json.load(open(p))

over, pts, used = {}, [], set()
stat = collections.Counter()
for r in rows:
    nm, city = r['정비구역명'].strip(), r['시군명'].strip()
    area = float(r['구역면적(㎡)'] or 0)
    k = norm(nm)
    cands = [z for c in city_codes.get(city, ()) for z in zones.get(c, [])]
    best, how = None, ''
    named = [z for z in cands if z[0] not in used and k and norm(z[1]) and (k == norm(z[1]) or (min(len(k), len(norm(z[1]))) >= 3 and (k in norm(z[1]) or norm(z[1]) in k)))]
    if named:
        best, how = min(named, key=lambda z: (k != norm(z[1]), abs(z[6] - area) if area else 0)), 'name'
    if not best and area:
        near = [z for z in cands if z[0] not in used and not norm(z[1]) and abs(z[6] - area) / area < 0.02]
        if len(near) == 1: best, how = near[0], 'area'
    dates = sorted([[lbl, r[col]] for col, lbl in DATES if re.fullmatch(r'\d{8}', r[col] or '') and r[col] <= '20261231'], key=lambda x: x[1])
    info = {
        'n': nm, 'st': STAGE.get(r['사업단계'], r['사업단계']), 'ty': r['사업유형'], 'dt': dates,
        'hh': r['사업시행세대수총계'].split('.')[0] or None, 'gen': r['일반분양세대수'] or None, 'own': r['토지등소유자수(명)'] or None,
        'by': r['사업시행자'] or None, 'old': r['(기존주택)준공년도'] or None, 'far': r['(신축)용적률'] or None,
    }
    info = {k2: v for k2, v in info.items() if v}
    if best:
        if info['st'] == '정비예정구역': info['st'] = '구역 지정'  # 국토부 자료에 경계가 있으면 이미 지정된 구역
        used.add(best[0]); over[best[0]] = info; stat[how] += 1
    else:
        info.update({'city': city, 'addr': r['위치'].replace(' nan', '').strip(), 'a': round(area), 'codes': sorted(city_codes.get(city, []))})
        pts.append(info); stat['point'] += 1
out = {'src': '경기도 일반 정비사업 추진현황(경기데이터드림, 2025.10 기준)', 'over': over, 'pts': pts}
json.dump(out, open(os.path.join(ROOT, 'zones', 'gg.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(stat, 'rows', len(rows))
print(collections.Counter(p['st'] for p in pts))
