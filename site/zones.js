/* 정비맵 — 전국 정비구역 레이어 (아실식 구역 칠하기 + 사업명/진행단계 라벨)
   자료: data/zones/index.json + data/zones/<시군구코드>.json (scripts/build_zones.py)
   app.js보다 먼저 읽히고, 지도가 만들어진 뒤 zonesInit()이 불립니다. */
'use strict';

const Z = {
  meta: null, files: {}, polys: {}, labels: {}, shown: new Set(), shownLabels: new Set(), selId: null,
  on: Object.assign({ st: 1, rd: 1, rc: 1, sm: 1, pb: 1, et: 0 }, LS.get('zoneCats', {})),
  showDone: LS.get('zoneDone', false), visible: LS.get('zoneOn', true), panel: false, busy: false, again: false,
};
const ZONE_MIN_LEVEL = 7;      // 이 레벨 이하(확대)에서 구역 표시
const ZONE_LABEL_LEVEL = 4;    // 이 레벨 이하에서 모든 라벨
const SHORT = {
  BZ101: '신통', BZ102: '재개발', BZ103: '재개발', BZ104: '재건축', BZ105: '재건축', BZ107: '주거환경', BZ108: '주거환경',
  BZ201: '모아타운', BZ202: '가로주택', BZ203: '자율주택', BZ204: '소규모재건축', BZ205: '소규모재개발',
  BZ301: '역세권 장기전세', BZ302: '역세권 활성화', BZ401: '촉진지구', BZ402: '재정비촉진', BZ403: '존치정비', BZ404: '존치관리',
  BZ501: '공공주택지구', BZ502: '도심복합', BZ601: '도시개발', BZ602: '리모델링', BZ603: '시장정비', BZ606: '사전협상',
};

const zCat = (k) => Z.meta.cats.find((c) => c[0] === k) || Z.meta.cats[1];
const zColor = (z) => zCat(z.k)[2];
const zDone = (z) => Z.meta.done.includes(z.s);
const zStage = (z) => Z.meta.stages[z.s] || z.s || '정비구역 지정';
const zTypeName = (z) => Z.meta.types[z.t] || z.t;
const zShort = (z) => SHORT[z.t] || (z.t === '정비구역' ? '정비구역' : z.t);
function zTitle(z) {
  const pre = zShort(z), n = z.n || '';
  if (!n) return pre + (z.addr ? ' ' + z.addr : '');
  return n.replace(/\s/g, '').startsWith(pre.replace(/\s/g, '')) || /재개발|재건축|정비|촉진|모아|가로|역세권/.test(n) ? n : `${pre} ${n}`;
}
function zDate(z) {
  const d = z.d || ''; if (!d) return '';
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : `${d}년`;
}
const bbHit = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

async function zonesInit() {
  try { Z.meta = await getJSON('data/zones/index.json'); } catch (e) { console.warn('정비구역 자료 없음', e); return; }
  kakao.maps.event.addListener(S.map, 'idle', zonesRefresh);
  renderZoneFilter();
  zonesRefresh();
  if ($('#drawer').classList.contains('on') && !R.q) renderDrawer();
}

async function loadZoneFile(code) {
  if (!Z.files[code]) {
    Z.files[code] = getJSON(`data/zones/${code}.json`).then((rows) => rows.map((r) => ({
      id: r[0], n: r[1], t: r[2], k: r[3], s: r[4], d: r[5], a: r[6], c: { lat: r[7][0] / 1e5, lng: r[7][1] / 1e5 }, p: r[8], bb: r[9], code,
    }))).catch(() => []);
  }
  return Z.files[code];
}

function decodeRing(arr) {
  const out = []; let a = 0, b = 0;
  for (let i = 0; i < arr.length; i += 2) { a += arr[i]; b += arr[i + 1]; out.push(new kakao.maps.LatLng(a / 1e5, b / 1e5)); }
  return out;
}

function zStyle(z, sel) {
  const c = zColor(z), done = zDone(z), outline = z.t === 'BZ401' || z.t === 'BZ201';
  return {
    strokeWeight: sel ? 3 : outline ? 2 : 1.5, strokeColor: done ? '#9aa4ae' : c, strokeOpacity: sel ? 1 : .9,
    strokeStyle: outline ? 'shortdash' : 'solid',
    fillColor: done ? '#9aa4ae' : c, fillOpacity: outline ? 0 : sel ? .32 : done ? .1 : .17,
  };
}

function ensurePoly(z) {
  if (Z.polys[z.id]) return Z.polys[z.id];
  const parts = z.p.map((pg) => new kakao.maps.Polygon(Object.assign({ path: pg.map(decodeRing), zIndex: z.t === 'BZ401' ? 0 : 1 }, zStyle(z, false))));
  parts.forEach((pg) => kakao.maps.event.addListener(pg, 'click', (e) => {
    if (S.draw) return addVertex(e.latLng);
    if (S.fix) return moveSite(e.latLng);
    selectZone(z);
  }));
  Z.polys[z.id] = parts;
  return parts;
}

function zoneVisible(z, view, lvl) {
  if (!Z.on[z.k]) return false;
  if (!Z.showDone && zDone(z)) return false;
  if (lvl >= ZONE_MIN_LEVEL && z.a < 15000 && z.id !== Z.selId) return false;
  return bbHit(z.bb, view);
}

async function zonesRefresh() {
  if (!Z.meta || !S.map) return;
  if (Z.busy) { Z.again = true; return; }
  Z.busy = true;
  try {
    const lvl = S.map.getLevel();
    const on = Z.visible && lvl <= ZONE_MIN_LEVEL;
    $('#zhint').classList.toggle('on', Z.visible && lvl > ZONE_MIN_LEVEL && lvl <= 10);
    const b = S.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
    const dLa = (ne.getLat() - sw.getLat()) * .25, dLo = (ne.getLng() - sw.getLng()) * .25;
    const view = [sw.getLat() - dLa, sw.getLng() - dLo, ne.getLat() + dLa, ne.getLng() + dLo];
    const codes = on ? Object.keys(Z.meta.sgg).filter((k) => bbHit(Z.meta.sgg[k].bb, view)) : [];
    const lists = await Promise.all(codes.map(loadZoneFile));
    const keep = new Set(), vis = [];
    for (const list of lists) for (const z of list) if (zoneVisible(z, view, lvl)) { keep.add(z.id); vis.push(z); }
    for (const id of Z.shown) if (!keep.has(id)) Z.polys[id]?.forEach((pg) => pg.setMap(null));
    for (const z of vis) if (!Z.shown.has(z.id)) ensurePoly(z).forEach((pg) => pg.setMap(S.map));
    Z.shown = keep;
    drawZoneLabels(vis, lvl);
  } finally {
    Z.busy = false;
    if (Z.again) { Z.again = false; zonesRefresh(); }
  }
}

// 같은 자리(신통+재개발처럼 겹친 구역)는 한 라벨에 묶어 표시
function drawZoneLabels(vis, lvl) {
  const want = new Map();
  const maxL = S.an && S.an.cx ? ZONE_LABEL_LEVEL - 1 : ZONE_LABEL_LEVEL; // 시세 배지가 떠 있으면 한 단계 더 확대했을 때만
  if (lvl <= maxL + 1 || Z.selId) {
    const list = vis.filter((z) => lvl <= maxL || (lvl === maxL + 1 && z.a >= 40000) || z.id === Z.selId).sort((a, b) => b.a - a.a);
    for (const z of list) {
      const key = Math.round(z.c.lat * 2500) + ':' + Math.round(z.c.lng * 2000);
      if (!want.has(key)) want.set(key, []);
      want.get(key).push(z);
    }
  }
  const keys = new Set();
  for (const [key, zs] of want) {
    const sig = key + '|' + zs.map((z) => z.id).join(',') + '|' + (zs.some((z) => z.id === Z.selId) ? 1 : 0);
    keys.add(sig);
    if (Z.labels[sig]) { if (!Z.shownLabels.has(sig)) Z.labels[sig].setMap(S.map); continue; }
    const el = document.createElement('div');
    el.className = 'zl' + (zs.some((z) => z.id === Z.selId) ? ' sel' : '');
    el.innerHTML = zs.slice(0, 3).map((z) => `<div class="zr${zDone(z) ? ' done' : ''}" data-id="${esc(z.id)}" style="--c:${zColor(z)}"><b>${esc(zTitle(z))}</b><span>${esc(zStage(z))}</span></div>`).join('');
    el.onclick = (e) => { e.stopPropagation(); const r = e.target.closest('.zr'); const z = zs.find((x) => x.id === r?.dataset.id) || zs[0]; selectZone(z); };
    const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(zs[0].c.lat, zs[0].c.lng), content: el, yAnchor: .5, zIndex: 6 });
    ov.setMap(S.map); Z.labels[sig] = ov;
  }
  for (const sig of Z.shownLabels) if (!keys.has(sig)) Z.labels[sig]?.setMap(null);
  Z.shownLabels = keys;
}

function restyleZone(id, sel) {
  const z = findZone(id); if (!z) return;
  Z.polys[id]?.forEach((pg) => pg.setOptions(zStyle(z, sel)));
}
function findZone(id) {
  for (const v of Object.values(Z.files)) if (Array.isArray(v)) { const z = v.find((x) => x.id === id); if (z) return z; }
  return Z._cache?.[id] || null;
}

// ---------- 구역 선택 → 사업장과 같은 시트(개요·주변 시세·청약) ----------
function selectZone(z) {
  (Z._cache ||= {})[z.id] = z;
  if (Z.selId && Z.selId !== z.id) restyleZone(Z.selId, false);
  Z.selId = z.id; restyleZone(z.id, true);
  const sgg = Z.meta.sgg[z.code] || {};
  const site = {
    id: 'z:' + z.id, zone: z, name: zTitle(z), type: zTypeName(z), stage: zStage(z), lat: z.c.lat, lng: z.c.lng,
    sido: sgg.sd || '', sgg: sgg.n || '', dong: '', households: null, area: null,
  };
  selectSite(site);
  zonesRefresh();
}
function clearZoneSel() { if (Z.selId) { restyleZone(Z.selId, false); Z.selId = null; zonesRefresh(); } }

function stageBar(z) {
  const seq = Z.meta.seqs[(z.s || '').slice(0, 4)];
  if (!seq || !z.s.startsWith('PP')) return '';
  const idx = seq.indexOf(z.s);
  return `<div class="stagebar">${seq.map((c, i) => `<div class="st ${i < idx ? 'past' : i === idx ? 'now' : ''}" style="--c:${zColor(z)}"><i></i><span>${esc(Z.meta.stages[c])}</span></div>`).join('')}</div>`;
}

function ourSiteFor(z) { // 이 구역과 겹치는 당사 사업장
  return S.sites.find((s) => { const p = sitePoint(s); return dist(p, z.c) < Math.max(250, Math.sqrt(z.a) * 0.7); });
}

function zoneInfoHTML(s, an) {
  const z = s.zone, ours = ourSiteFor(z);
  return `
    ${ours ? `<div class="note ours" data-site="${esc(ours.id)}" style="cursor:pointer">🏗️ 당사 사업장 <b>${esc(ours.name)}</b> 구역이에요 — 눌러서 사업장 정보 보기</div>` : ''}
    ${stageBar(z)}
    <dl class="dl">
      <dt>사업유형</dt><dd>${esc(zTypeName(z))}</dd>
      <dt>진행 단계</dt><dd>${esc(zStage(z))}${zDone(z) ? ' <span class="meta">(완료)</span>' : ''}</dd>
      <dt>소재지</dt><dd>${esc(an.addr || [s.sido, s.sgg].filter(Boolean).join(' ') || '-')}</dd>
      <dt>구역 면적</dt><dd>${fmtArea(z.a)}</dd>
      <dt>${z.id[0] === 'S' ? '자료 작성일' : '고시'}</dt><dd>${esc(zDate(z) || '-')}</dd>
    </dl>
    <div class="note">출처: ${esc(Z.meta.src[z.id[0]])}. ${z.id[0] === 'S' ? '서울시가 공개한 사업별 추진단계 기준이라 최근 변경이 늦게 반영될 수 있어요.' : '정비구역 경계·고시 자료라 추진위·조합 등 세부 단계는 담겨 있지 않아요.'}</div>`;
}

// ---------- 필터 ----------
function renderZoneFilter() {
  const el = $('#zfilter'); if (!el || !Z.meta) return;
  el.innerHTML = `<div class="zf-row">
      <button class="zf-tog ${Z.visible ? 'on' : ''}" data-z="vis">정비구역 ${Z.visible ? '켜짐' : '꺼짐'}</button>
      ${Z.meta.cats.map(([k, l, c]) => `<button class="chip ${Z.on[k] ? 'on' : ''}" data-k="${k}" style="--c:${c}"><i></i>${l}</button>`).join('')}
      <button class="chip ${Z.showDone ? 'on' : ''}" data-z="done" style="--c:#9aa4ae"><i></i>준공 포함</button>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { Z.on[b.dataset.k] = Z.on[b.dataset.k] ? 0 : 1; LS.set('zoneCats', Z.on); }
    else if (b.dataset.z === 'done') { Z.showDone = !Z.showDone; LS.set('zoneDone', Z.showDone); }
    else if (b.dataset.z === 'vis') { Z.visible = !Z.visible; LS.set('zoneOn', Z.visible); }
    renderZoneFilter(); zonesRefresh();
  };
  zoneTabLabel();
}
function zoneTabLabel() {
  const n = Object.values(Z.on).filter(Boolean).length;
  const el = $('#zoneCnt'); if (el) el.textContent = Z.visible ? `${n}/${Z.meta.cats.length}` : '끔';
  $('#ftabs [data-p="zones"]')?.classList.toggle('on', Z.visible);
}
