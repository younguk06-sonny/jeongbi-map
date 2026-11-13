"""전국 정비구역 레이어 만들기 → site/data/zones/
  - 서울: 서울시 '도시계획사업(서울플랜+)' SHP (사업유형·추진단계 코드 포함, EPSG:5174)
  - 그 외: 국토교통부 '(연속주제) 도시및주거환경정비 정비구역' 시도별 SHP (EPSG:5186)
사용법:
  python3 build_zones.py --seoul <UPIS_C_UQ120.shp> --nat <LSMD_CONT_UD602_*.shp ...> [--asof-seoul 2026.09] [--asof-nat 2026.10]
결과:
  zones/index.json  — 코드표·시군구별 범위
  zones/<시군구코드>.json — 구역 목록 (좌표는 1e-5도 정수 차분)
외부 라이브러리 없이 동작합니다."""
import argparse, json, math, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import shp_to_areas as P

OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'data', 'zones')

# ---- 서울플랜+ 코드표 (열린데이터광장 첨부 코드표) ----
TYPES = {
    'BZ101': '신속통합기획', 'BZ102': '재개발(도시정비형)', 'BZ103': '재개발(주택정비형)', 'BZ104': '재건축(단독)', 'BZ105': '재건축(공동)',
    'BZ107': '주거환경개선(관리형)', 'BZ108': '주거환경개선(정비형)',
    'BZ201': '모아타운', 'BZ202': '가로주택정비', 'BZ203': '자율주택정비', 'BZ204': '소규모재건축', 'BZ205': '소규모재개발',
    'BZ301': '역세권 장기전세주택', 'BZ302': '역세권 활성화',
    'BZ401': '재정비촉진지구', 'BZ402': '재정비촉진구역', 'BZ403': '존치정비구역', 'BZ404': '존치관리구역',
    'BZ501': '공공주택지구', 'BZ502': '도심 공공주택 복합사업',
    'BZ601': '도시개발사업', 'BZ602': '리모델링활성화구역', 'BZ603': '시장정비사업', 'BZ606': '사전협상제',
}
# 지도 색·필터 묶음
CAT_OF = {
    'BZ101': 'st', 'BZ102': 'rd', 'BZ103': 'rd', 'BZ107': 'rd', 'BZ108': 'rd', 'BZ402': 'rd',
    'BZ104': 'rc', 'BZ105': 'rc',
    'BZ201': 'sm', 'BZ202': 'sm', 'BZ203': 'sm', 'BZ204': 'sm', 'BZ205': 'sm',
    'BZ301': 'pb', 'BZ302': 'pb', 'BZ501': 'pb', 'BZ502': 'pb',
    'BZ401': 'et', 'BZ403': 'et', 'BZ404': 'et', 'BZ601': 'et', 'BZ602': 'et', 'BZ603': 'et', 'BZ606': 'et',
}
CATS = [
    ['st', '신속통합기획', '#e64980'], ['rd', '재개발', '#1c7ed6'], ['rc', '재건축', '#2f9e44'],
    ['sm', '소규모·모아', '#f76707'], ['pb', '역세권·공공', '#7048e8'], ['et', '기타', '#868e96'],
]
STAGES = {
    'PP0101': '대상지 선정(추진중)', 'PP0102': '대상지 선정', 'PP0103': '기획 완료', 'PP0104': '보류',
    'PP0201': '입안 제안', 'PP0202': '열람공고', 'PP0203': '위원회 심의', 'PP0204': '구역 지정', 'PP0205': '추진위 구성', 'PP0206': '조합설립인가',
    'PP0207': '건축심의', 'PP0208': '사업시행인가', 'PP0209': '관리처분인가', 'PP0210': '착공', 'PP0211': '준공',
    'PP0301': '대상지 선정', 'PP0302': '정비계획 수립', 'PP0303': '위원회 심의', 'PP0304': '구역 지정', 'PP0305': '사업시행인가', 'PP0306': '착공', 'PP0307': '준공(일부)', 'PP0308': '준공',
    'PP0401': '수립범위 자문', 'PP0402': '대상지 선정', 'PP0403': '관리지역 고시', 'PP0404': '사전자문', 'PP0405': '위원회 심의', 'PP0406': '관리지역 고시',
    'PP0500': '연번부여(조합설립 추진)', 'PP0501': '조합설립인가', 'PP0502': '건축심의', 'PP0503': '사업시행인가', 'PP0504': '착공', 'PP0505': '준공',
    'PP0601': '주민합의체 구성', 'PP0602': '건축심의', 'PP0603': '사업시행인가', 'PP0604': '착공', 'PP0605': '준공',
    'PP0701': '조합설립 추진', 'PP0702': '조합설립인가', 'PP0703': '건축심의', 'PP0704': '사업시행인가', 'PP0705': '착공', 'PP0706': '준공',
    'PP0801': '대상지 선정', 'PP0802': '사전검토', 'PP0803': '입안 제안', 'PP0804': '열람공고', 'PP0805': '위원회 심의', 'PP0806': '구역 지정',
    'PP0807': '건축심의', 'PP0808': '사업계획승인', 'PP0809': '착공', 'PP0810': '준공',
    'PP1801': '대상지 선정', 'PP1802': '통심위 사전자문', 'PP1803': '입안 제안', 'PP1804': '열람공고', 'PP1805': '위원회 심의', 'PP1806': '구역 지정',
    'PP1807': '건축·통합심의', 'PP1808': '사업계획승인', 'PP1809': '착공', 'PP1810': '준공',
    'PP1001': '지구 지정', 'PP1002': '지구 변경',
    'PP1101': '대상지 선정', 'PP1102': '촉진계획 수립', 'PP1103': '열람공고', 'PP1104': '위원회 심의', 'PP1105': '구역 지정', 'PP1107': '추진위 구성',
    'PP1108': '조합설립인가', 'PP1109': '건축심의', 'PP1110': '사업시행인가', 'PP1111': '관리처분인가', 'PP1112': '착공', 'PP1113': '준공',
    'PP2101': '구역 지정', 'PP2102': '구역 변경',
    'PP2001': '입안 제안', 'PP2002': '열람공고', 'PP2003': '위원회 심의', 'PP2004': '지구 지정', 'PP2005': '지구계획 승인', 'PP2006': '착공', 'PP2007': '준공',
    'PP1201': '예정지구 지정', 'PP1202': '후보지 선정', 'PP1203': '지구 지정', 'PP1204': '설계공모 완료', 'PP1205': '사업계획승인', 'PP1206': '착공', 'PP1207': '준공', 'PP1208': '입주', 'PP1209': '후보지 철회',
    'PP1301': '입안 제안', 'PP1302': '열람공고', 'PP1303': '위원회 심의', 'PP1304': '구역 지정', 'PP1305': '실시계획인가', 'PP1306': '준공',
    'PP1401': '조합설립인가', 'PP1402': '1차 안전진단', 'PP1403': '건축심의', 'PP1404': '리모델링 허가', 'PP1405': '2차 안전진단', 'PP1406': '착공', 'PP1407': '준공',
    'PP1501': '추진계획 수립', 'PP1502': '추진계획 승인', 'PP1503': '조합설립인가', 'PP1504': '사업시행인가', 'PP1505': '관리처분인가', 'PP1506': '착공', 'PP1507': '준공',
    'PP2201': '대상지 선정', 'PP2202': '제안서 접수', 'PP2203': '협상조정협의회', 'PP2204': '협상 완료', 'PP2205': '입안 절차', 'PP2206': '도시건축공동위 심의',
    'PP2207': '결정고시', 'PP2208': '인허가 절차', 'PP2209': '착공', 'PP2210': '준공',
}
# 단계 순서(진행 막대) — 코드 앞 4자리 묶음, 보류·철회·변경은 막대에서 제외
SEQ_SKIP = {'PP0104', 'PP1209', 'PP0403', 'PP2102', 'PP1002', 'PP0307'}
DONE = {'PP0211', 'PP0308', 'PP0505', 'PP0605', 'PP0706', 'PP0810', 'PP1810', 'PP1113', 'PP2007', 'PP1207', 'PP1208', 'PP1306', 'PP1407', 'PP1507', 'PP2210'}
SEQS = defaultdict(list)
for code in STAGES:
    if code not in SEQ_SKIP: SEQS[code[:4]].append(code)

# 서울 시군구 코드 → 이름
SEOUL_GU = {'11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구', '11230': '동대문구', '11260': '중랑구', '11290': '성북구',
            '11305': '강북구', '11320': '도봉구', '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구', '11500': '강서구',
            '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구', '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구'}
SIDO_NAME = {'11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '36': '세종', '41': '경기', '42': '강원', '51': '강원',
             '43': '충북', '44': '충남', '45': '전북', '52': '전북', '46': '전남', '12': '전남광주', '47': '경북', '48': '경남', '50': '제주'}

# ---- 기하 ----
def ring_area(r):  # 부호 있는 면적(투영 좌표, ㎡)
    return sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r))) / 2

def inside(pt, ring):
    x, y = pt; c = False
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def simplify_ring(ring, tol):
    ring = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if len(ring) <= 4: return ring
    far = max(range(len(ring)), key=lambda k: (ring[k][0] - ring[0][0]) ** 2 + (ring[k][1] - ring[0][1]) ** 2)
    return P.simplify(ring[:far + 1], tol)[:-1] + P.simplify(ring[far:] + [ring[0]], tol)[:-1]

def to_polys(rings):
    """SHP 링들 → [[바깥, 구멍...], ...] (투영 좌표). 바깥 링은 시계방향(면적 음수)."""
    outers, holes = [], []
    for r in rings:
        if len(r) < 4: continue
        (outers if ring_area(r) < 0 else holes).append(r)
    if not outers: outers, holes = holes, []
    polys = [[o] for o in outers]
    for h in holes:
        for pg in polys:
            if inside(h[0], pg[0]): pg.append(h); break
    return polys

def encode_ring(ring_ll):
    out, pla, plo = [], 0, 0
    for la, lo in ring_ll:
        a, b = round(la * 1e5), round(lo * 1e5)
        out += [a - pla, b - plo]; pla, plo = a, b
    return out

def feature(rings, tol):
    polys = to_polys(rings)
    if not polys: return None
    area = sum(abs(ring_area(pg[0])) - sum(abs(ring_area(h)) for h in pg[1:]) for pg in polys)
    if area < 50: return None
    big = max(polys, key=lambda pg: abs(ring_area(pg[0])))[0]
    # 라벨 위치: 가장 큰 바깥 링의 무게중심(밖이면 가장 가까운 꼭짓점 쪽)
    A = cx = cy = 0
    for i in range(len(big)):
        x1, y1 = big[i - 1]; x2, y2 = big[i]; c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    c = (cx / (3 * A), cy / (3 * A)) if A else big[0]
    if not inside(c, big):
        c = min(big, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2)
    enc = []
    lat_min = lng_min = 999; lat_max = lng_max = -999
    for pg in polys:
        out_pg = []
        for r in pg:
            s = simplify_ring(r, tol)
            if len(s) < 3: continue
            ll = [P.to_wgs(x, y) for x, y in s]
            for la, lo in ll:
                lat_min, lat_max, lng_min, lng_max = min(lat_min, la), max(lat_max, la), min(lng_min, lo), max(lng_max, lo)
            out_pg.append(encode_ring(ll))
        if out_pg: enc.append(out_pg)
    if not enc: return None
    cla, clo = P.to_wgs(*c)
    return {'a': round(area), 'c': [round(cla * 1e5), round(clo * 1e5)], 'p': enc, 'bb': [lat_min, lng_min, lat_max, lng_max]}

def clean(s):
    s = (s or '').replace('\x00', '').strip()
    s = re.sub(r'\((상세|자세한)[^)]*\)?', '', s)
    s = re.sub(r'\s+', ' ', s).strip(' ,-')
    return s

def nat_type(name):
    n = name or ''
    if re.search(r'재정비촉진|촉진구역', n): return 'rd', '재정비촉진구역'
    if re.search(r'가로주택|소규모|자율주택', n): return 'sm', '소규모정비'
    if re.search(r'재건축', n): return 'rc', '재건축'
    if re.search(r'주거환경', n): return 'rd', '주거환경개선'
    if re.search(r'도시환경|도시정비형', n): return 'rd', '재개발(도시정비형)'
    if re.search(r'재개발', n): return 'rd', '재개발'
    if re.search(r'공공|도심복합', n): return 'pb', '공공재개발 등'
    return 'rd', '정비구역'

def fmt_date(s):
    s = (s or '').replace('\x00', '').strip()
    return s[:8] if re.fullmatch(r'\d{8}', s[:8] or '') else ''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seoul'); ap.add_argument('--nat', nargs='*', default=[])
    ap.add_argument('--asof-seoul', default='2026.09'); ap.add_argument('--asof-nat', default='2026.10')
    a = ap.parse_args()
    by_sgg = defaultdict(list)
    skip = {'BZ303', 'BZ304', 'BZ305', 'BZ306', 'BZ604'}  # 개별 건물·대규모 재생지역은 제외

    if a.seoul:
        P.__dict__.update(A=6377397.155, E2=1 - (6377397.155 * (1 - 1 / 299.1528128) / 6377397.155) ** 2,
                          LON0=math.radians(127.0028902777778), FN=500000.0, CRS='5174')
        recs, shapes = P.read_dbf(a.seoul[:-3] + 'dbf'), P.read_shp(a.seoul)
        for r, rings in zip(recs, shapes):
            t = r['SCLAS_CL']
            if t in skip or t not in TYPES or not rings: continue
            f = feature(rings, 1.2)
            if not f: continue
            f.update({'i': 'S' + r['PRESENT_SN'], 'n': clean(r['DGM_NM']), 't': t, 'k': CAT_OF[t], 's': r['PROPEL_CD'],
                      'd': fmt_date(r['CREATE_DAT']), 'src': 'S'})
            by_sgg[r['SIGNGU_SE']].append(f)

    if a.nat:
        P.use_5186()
        for path in a.nat:
            sd = re.search(r'_(\d\d)_\d{6}\.shp$', path).group(1)
            if sd == '11' and a.seoul: continue  # 서울은 서울플랜+ 사용
            recs, shapes = P.read_dbf(path[:-3] + 'dbf'), P.read_shp(path)
            for r, rings in zip(recs, shapes):
                if not rings: continue
                f = feature(rings, 1.5)
                if not f: continue
                alias, remark = clean(r.get('ALIAS')), clean(r.get('REMARK'))
                name = alias if alias and not re.fullmatch(r'(주택)?(재개발|재건축)?정비구역', alias) else remark if remark and len(remark) < 40 else alias
                k, tl = nat_type(alias + ' ' + remark)
                mnum = clean(r.get('MNUM'))
                d = fmt_date(r.get('NTFDATE'))
                if not d and re.fullmatch(r'\d{12}(19|20)\d\d.*', mnum): d = mnum[12:16]  # 관리번호 속 고시연도
                stage = '정비계획 수립 중(행위제한)' if '수립 중' in (alias + remark) else '정비구역 지정'
                if '수립 중' in name: name = ''
                f.update({'i': 'N' + mnum, 'n': name, 't': tl, 'k': k, 's': stage, 'd': d, 'src': 'N'})
                by_sgg[clean(r.get('COL_ADM_SE'))[:5]].append(f)

    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.endswith('.json'): os.remove(os.path.join(OUT, fn))
    index = {}
    total = 0
    for sgg, fs in sorted(by_sgg.items()):
        if not sgg: continue
        bb = [min(f['bb'][0] for f in fs), min(f['bb'][1] for f in fs), max(f['bb'][2] for f in fs), max(f['bb'][3] for f in fs)]
        rows = [[f['i'], f['n'], f['t'], f['k'], f['s'], f['d'], f['a'], f['c'], f['p'], [round(v, 5) for v in f['bb']]] for f in fs]
        with open(os.path.join(OUT, sgg + '.json'), 'w') as fp:
            json.dump(rows, fp, ensure_ascii=False, separators=(',', ':'))
        index[sgg] = {'sd': SIDO_NAME.get(sgg[:2], ''), 'n': SEOUL_GU.get(sgg, ''), 'bb': [round(v, 4) for v in bb], 'cnt': len(fs), 'src': fs[0]['src']}
        total += len(fs)
    meta = {
        'cols': ['id', '이름', '유형', '분류', '단계코드', '고시·작성일', '면적㎡', '라벨위치(1e-5도)', '경계(1e-5도 차분)', '범위'],
        'cats': CATS, 'types': TYPES, 'stages': STAGES, 'seqs': SEQS, 'done': sorted(DONE),
        'src': {'S': f'서울시 도시계획사업(서울플랜+) {a.asof_seoul}', 'N': f'국토교통부 연속주제 정비구역 {a.asof_nat}'},
        'sgg': index,
    }
    with open(os.path.join(OUT, 'index.json'), 'w') as fp:
        json.dump(meta, fp, ensure_ascii=False, separators=(',', ':'))
    print('구역', total, '개 · 시군구', len(index), '개')

if __name__ == '__main__':
    main()
