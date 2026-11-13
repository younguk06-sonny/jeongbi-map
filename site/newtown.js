/* 정비맵 — 1기 신도시 노후계획도시 특별정비(예정)구역
   자료: data/newtown.json (scripts/build_newtown.py) — 구역 이름은 각 시 기본계획, 소속 단지는 실거래 단지명.
   공개 경계 도면이 없어 소속 단지 위치(카카오 검색)를 감싸는 대략적인 영역으로 그립니다.
   zones.js의 정비구역 레이어에 분류 'nt'로 끼워 넣습니다. */
'use strict';

const NT = { data: null, zones: {}, pending: new Set(), loading: null };
const NT_CAT = ['nt', '1기 신도시', '#c2255c'];
const NT_R = 95; // 단지 한 곳을 감쌀 반지름(m)

async function ntInit() {
  try { NT.data = await getJSON('data/newtown.json'); } catch (e) { return; }
  if (!Z.meta.cats.some((c) => c[0] === 'nt')) Z.meta.cats.splice(1, 0, NT_CAT);
  Object.assign(Z.meta.types, { NT1: '노후계획도시 특별정비예정구역', NT2: '노후계획도시 특별정비구역' });
  Z.meta.src.T = '각 시 노후계획도시정비기본계획(구역 이름) · 국토부 실거래가(소속 단지)';
  SHORT.NT1 = '예정'; SHORT.NT2 = '특별정비';
  if (Z.on.nt === undefined) Z.on.nt = 1;
  // 도시별 대략 범위(소속 단지 위치가 정해지면 갱신)
  for (const c of NT.data.cities) c.bb = c.bb || null;
}

const ntKey = (a) => 'nt|' + a[2] + '|' + a[1] + '|' + a[0];
async function ntLocate(a, city) {
  const k = ntKey(a);
  if (Geo.get(k) !== undefined) return pt(Geo.get(k));
  const sg = city.name.split(' ')[0]; // 부천
  const full = a[0].replace(/[()]/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const base = a[0].replace(/\(.*?\)/g, '').trim();
  const sub = (a[0].match(/\(([^,)]+)/) || [])[1] || '';
  const isApt = (x) => /아파트|주거/.test(x.category_name) && (x.address_name || '').includes(a[1]);
  let hit = null;
  for (const q of [`${sg} ${a[1]} ${full}`, `${sg} ${base} ${sub}`, `${sg} ${a[1]} ${base}${sub}`]) {
    const res = await Kakao.keyword(q);
    const toks = sub.match(/[0-9]+|[^0-9\s]+/g) || [];
    hit = res.find((x) => isApt(x) && toks.every((t) => x.place_name.toUpperCase().includes(t.toUpperCase())))
      || (toks.length ? null : res.find((x) => isApt(x) && x.place_name.includes(base.replace('마을', ''))));
    if (hit) break;
  }
  if (!hit) { const res = await Kakao.keyword(`${sg} ${a[1]} ${base}`); hit = res.find((x) => isApt(x) && x.place_name.includes(base.replace('마을', ''))); }
  Geo.put(k, hit ? [+hit.y, +hit.x] : 0);
  return pt(Geo.get(k));
}

// 단지 위치를 찾아 도시의 구역 모양을 만든다 (처음 한 번만 검색, 이후 저장된 위치 사용)
function ntPrepare(city) {
  if (city._ready) return true;
  if (NT.pending.has(city.id)) return false;
  NT.pending.add(city.id);
  (async () => {
    const all = city.zones.flatMap((z) => z.apts);
    for (let i = 0; i < all.length; i += 6) await Promise.all(all.slice(i, i + 6).map((a) => ntLocate(a, city)));
    Geo.flush();
    ntBuild(city); city._ready = true; NT.pending.delete(city.id);
    zonesRefresh();
  })();
  return false;
}

function ntBuild(city) {
  const lats = [], lngs = [];
  city.zones.forEach((z, i) => {
    let pts = z.apts.map((a) => pt(Geo.get(ntKey(a)))).filter(Boolean);
    if (!pts.length) return;
    // 잘못 찾은 위치(중앙값에서 900m 넘게 떨어진 곳)는 뺀다
    const med = (arr) => arr.slice().sort((x, y) => x - y)[arr.length >> 1];
    const m = { lat: med(pts.map((p) => p.lat)), lng: med(pts.map((p) => p.lng)) };
    pts = pts.filter((p) => dist(p, m) < 900);
    // 단지마다 원을 두르고 전체를 감싸는 외곽선
    const ring = [], kLat = NT_R / 111320, kLng = NT_R / (111320 * Math.cos(m.lat * Math.PI / 180));
    for (const p of pts) for (let t = 0; t < 16; t++) { const a = t / 16 * Math.PI * 2; ring.push([p.lat + Math.sin(a) * kLat, p.lng + Math.cos(a) * kLng]); }
    const hull = convexHull(ring);
    const c = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
    const bb = [Math.min(...hull.map((h) => h[0])), Math.min(...hull.map((h) => h[1])), Math.max(...hull.map((h) => h[0])), Math.max(...hull.map((h) => h[1]))];
    lats.push(bb[0], bb[2]); lngs.push(bb[1], bb[3]);
    const id = `T:${city.id}:${i}`;
    NT.zones[id] = {
      id, n: z.n, t: z.s === 'P' ? 'NT1' : 'NT2', k: 'nt', s: NT.data.stages[z.s], d: '', a: Math.round(polyArea(hull)), c, bb,
      rings: [hull.map((h) => new kakao.maps.LatLng(h[0], h[1]))], code: city.apts?.[0]?.[2] || z.apts[0][2],
      nt: { city, z, found: pts.length },
    };
  });
  if (lats.length) city.bb = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
}

function convexHull(P) {
  P = P.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const cr = (o, a, b) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// zonesRefresh에서 호출: 보이는 범위의 1기 신도시 구역
function ntZonesIn(view) {
  if (!NT.data || !Z.on.nt) return [];
  const out = [];
  for (const city of NT.data.cities) {
    if (city.bb && !bbHit(city.bb, view)) continue;
    if (!city.bb && city.hint && !bbHit(city.hint, view)) continue;
    if (!ntPrepare(city)) continue;
    for (const z of Object.values(NT.zones)) if (z.nt.city === city) out.push(z);
  }
  return out;
}

function ntInfoHTML(z) {
  const { city, z: d, found } = z.nt;
  const steps = ['P', 'R', 'D'], idx = steps.indexOf(d.s);
  return `
    <div class="stagebar">${steps.map((k, i) => `<div class="st ${i < idx ? 'past' : i === idx ? 'now' : ''}" style="--c:${NT_CAT[2]}"><i></i><span>${esc(NT.data.stages[k])}</span></div>`).join('')}</div>
    <dl class="dl">
      <dt>사업유형</dt><dd>노후계획도시 정비 (${esc(city.name)})</dd>
      <dt>진행 단계</dt><dd>${esc(NT.data.stages[d.s])}${d.note ? ` <span class="meta">${esc(d.note)}</span>` : ''}</dd>
      <dt>소속 단지</dt><dd>${d.apts.map((a) => esc(a[0])).join('<br>')}</dd>
    </dl>
    <div class="note">구역 이름: <a href="${esc(city.url)}" target="_blank" rel="noopener">${esc(city.plan)}</a>. 공개된 경계 도면이 없어 소속 단지 ${found}곳의 위치를 감싸 대략적으로 그렸어요. 실제 구역 경계와 다를 수 있어요.</div>`;
}
