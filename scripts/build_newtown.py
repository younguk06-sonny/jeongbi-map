"""1기 신도시 노후계획도시 특별정비(예정)구역 → site/data/newtown.json
구역 이름은 각 시 '노후계획도시정비기본계획' 공개 목록, 소속 단지는 실거래 단지명(near/)을 마을 이름으로 묶어 만듭니다.
경계 도면은 공개 SHP가 없어, 지도에서는 소속 단지 위치를 감싸는 대략적인 영역으로 그립니다."""
import json, os, re
ROOT = os.path.join(os.path.dirname(__file__), '..', 'site', 'data')

# 단계: P=특별정비예정구역, R=특별정비계획 주민공람, D=특별정비구역 지정
CITIES = [
  dict(id='jd', name='부천 중동', codes=['41192'], dongs=['중동', '상동'], built=(1990, 1998), hint=[37.482, 126.738, 37.518, 126.792],
       plan='부천시 노후계획도시정비기본계획(특별정비예정구역 18곳)',
       url='https://www.bucheon.go.kr/site/homepage/menu/viewMenu?menuid=173002001003',
       zones=[
         ('한라마을', 'P', ['한라마을(']), ('덕유마을', 'P', ['덕유마을(']), ('설악마을', 'P', ['설악마을(']),
         ('금강마을', 'R', ['금강마을(']), ('은하마을', 'D', ['은하마을(']), ('중흥마을', 'R', ['중흥마을(']),
         ('포도마을', 'R', ['포도마을(']), ('미리내마을', 'P', ['미리내마을(']), ('보람마을', 'P', ['보람마을(']),
         ('무지개마을', 'P', ['무지개마을(']), ('그린타운', 'P', ['그린타운(']), ('꿈마을', 'P', ['꿈마을(']),
         ('연화마을', 'P', ['연화마을(']), ('한아름마을', 'P', ['한아름마을(']), ('사랑·꿈동산마을', 'R', ['사랑마을(', '꿈동산(']),
         ('반달마을A', 'R', ['반달마을(삼익', '반달마을(동아', '반달마을(선경', '반달마을(건영']),
         ('반달마을B', 'P', ['반달마을(극동']), ('복사골마을', 'P', ['복사골아파트', '복사골(']),
       ]),
]
STAGE = {'P': '특별정비예정구역', 'R': '특별정비계획 주민공람', 'D': '특별정비구역 지정'}
NOTE = {'R': '2026.10 특별정비계획(안) 주민공람', 'D': '2026.06 특별정비구역 지정·고시'}

out = {'stages': STAGE, 'cities': []}
for c in CITIES:
    cx = []
    for code in c['codes']:
        d = json.load(open(os.path.join(ROOT, 'near', code + '.json')))
        cx += [(r[0], r[1], r[2], code) for r in d['cx'] if r[1] in c['dongs']]
    zs = []
    for n, st, pre in c['zones']:
        apts = [[a, dong, code] for a, dong, b, code in cx if any(a.startswith(p) for p in pre) and b and c['built'][0] <= b <= c['built'][1]]
        assert apts, n
        z = {'n': n, 's': st, 'apts': apts}
        if st in NOTE: z['note'] = NOTE[st]
        zs.append(z)
        print(c['name'], n, st, [a[0] for a in apts])
    out['cities'].append({k: c[k] for k in ('id', 'name', 'plan', 'url', 'hint')} | {'sido': '경기', 'zones': zs})
json.dump(out, open(os.path.join(ROOT, 'newtown.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
