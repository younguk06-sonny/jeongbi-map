/* 정비맵 — 왼쪽 지역 선택·검색 창 (아실식 시도 → 시군구 선택 + 통합 검색) */
'use strict';

const SIDO_ORDER = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남광주', '경북', '경남', '제주'];
const SIDO_FULL = {
  서울: '서울특별시', 경기: '경기도', 인천: '인천광역시', 부산: '부산광역시', 대구: '대구광역시', 광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시',
  세종: '세종특별자치시', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남광주: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도',
};
const SIDO_LEVEL = { 서울: 9, 인천: 10, 부산: 9, 대구: 9, 광주: 8, 대전: 8, 울산: 9, 세종: 9, 제주: 10 };
const R = { list: null, sd: null, q: '', allZones: null, whereT: null };

function regionList() { // { sd: [{code, n}] } — 실거래 자료의 시군구 목록
  if (R.list) return R.list;
  if (!S.meta) return {};
  const by = {};
  for (const [code, v] of Object.entries(S.meta?.codes || {})) (by[v.sd] ||= []).push({ code, n: v.n, sd: v.sd });
  for (const arr of Object.values(by)) arr.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
  R.list = by; return by;
}
function zoneCountBySido() {
  const c = {};
  for (const v of Object.values(Z.meta?.sgg || {})) c[v.sd] = (c[v.sd] || 0) + v.cnt;
  return c;
}

function regionBind() {
  if (innerWidth >= 900) setTimeout(() => openDrawer(true), 0);
  $('#btnRegion').addEventListener('click', () => openDrawer(true));
  $('#drClose').addEventListener('click', () => openDrawer(false));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  let t = null;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { R.q = e.target.value.trim(); renderDrawer(); }, 220); });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = $('#drBody [data-go]'); if (first) first.click(); } });
  $('#drBody').addEventListener('click', onDrawerClick);
  $('#crumb').addEventListener('click', (e) => { const b = e.target.closest('[data-crumb]'); if (!b) return; R.sd = b.dataset.crumb || null; renderDrawer(); });
}

function openDrawer(on) {
  $('#drawer').classList.toggle('on', on);
  document.body.classList.toggle('dr-open', on && innerWidth >= 900);
  setTimeout(() => S.map && S.map.relayout(), 260);
  $('#scrim').classList.toggle('on', on && innerWidth < 900);
  if (on) {
    openTab(null);
    renderDrawer();
    if (innerWidth >= 900) setTimeout(() => $('#q').focus(), 50);
  }
}

function renderDrawer() {
  const body = $('#drBody'), crumb = $('#crumb');
  if (R.q) { crumb.innerHTML = `<span>‘${esc(R.q)}’ 검색 결과</span>`; return renderSearch(); }
  const list = regionList(), zc = zoneCountBySido();
  if (!R.sd) {
    crumb.innerHTML = '<span>시도 선택</span>';
    const sds = SIDO_ORDER.filter((sd) => list[sd]).concat(Object.keys(list).filter((sd) => !SIDO_ORDER.includes(sd)));
    body.innerHTML = `<div class="rg-grid">${sds.map((sd) => {
      const ours = S.sites.filter((s) => s.sido === sd).length;
      return `<button class="rg-cell" data-sd="${esc(sd)}"><b>${esc(sd)}</b><small>${zc[sd] ? `구역 ${fmtN(zc[sd])}` : `${list[sd].length}개 시군구`}</small>${ours ? `<em>당사 ${ours}</em>` : ''}</button>`;
    }).join('')}</div>`;
    return;
  }
  const sd = R.sd, arr = list[sd] || [];
  crumb.innerHTML = `<button data-crumb="">전국</button><i>›</i><b>${esc(sd)}</b>`;
  const ours = S.sites.filter((s) => s.sido === sd);
  body.innerHTML = `
    <button class="rg-row strong" data-go="sido" data-sd="${esc(sd)}"><span class="grow">${esc(sd)} 전체 보기</span><i>›</i></button>
    ${ours.length ? `<div class="rg-sec">당사 사업장</div>${ours.map((s) => `<button class="rg-row" data-go="site" data-id="${esc(s.id)}"><i class="dot" style="background:${typeColor(s.type)}"></i><span class="grow">${esc(s.name)}<small>${esc(s.sgg)}</small></span><i>›</i></button>`).join('')}` : ''}
    <div class="rg-sec">시군구</div>
    <div class="rg-grid sgg">${arr.map((r) => `<button class="rg-cell" data-go="sgg" data-code="${r.code}"><b>${esc(r.n)}</b>${S.sites.some((s) => s.sido === sd && r.n.includes(s.sgg.split(' ').pop())) ? '<em>당사</em>' : ''}</button>`).join('')}</div>`;
}

// ---------- 통합 검색 ----------
async function loadAllZones() {
  if (R.allZones) return R.allZones;
  R.allZones = Promise.all(Object.keys(Z.meta?.sgg || {}).map(loadZoneFile)).then((ls) => ls.flat());
  return R.allZones;
}
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

async function renderSearch() {
  const q = R.q, nq = norm(q), body = $('#drBody');
  const list = regionList();
  const regs = [];
  for (const sd of Object.keys(list)) {
    if (norm(sd).includes(nq) || norm(SIDO_FULL[sd]).includes(nq)) regs.push({ kind: 'sido', sd, label: sd, sub: SIDO_FULL[sd] || '' });
    for (const r of list[sd]) if (norm(r.n).includes(nq) || norm(sd + r.n).includes(nq)) regs.push({ kind: 'sgg', code: r.code, label: `${sd} ${r.n}`, sub: '시군구' });
  }
  const sites = S.sites.filter((s) => norm(s.name + s.sgg + s.dong).includes(nq));
  const sec = (title, html) => html ? `<div class="rg-sec">${title}</div>${html}` : '';
  const draw = (zonesHTML, placesHTML) => {
    const html = sec('지역', regs.slice(0, 8).map((r) => `<button class="rg-row" data-go="${r.kind}" ${r.kind === 'sido' ? `data-sd="${esc(r.sd)}"` : `data-code="${r.code}"`}><span class="grow">${esc(r.label)}<small>${esc(r.sub)}</small></span><i>›</i></button>`).join(''))
      + sec('당사 사업장', sites.map((s) => `<button class="rg-row" data-go="site" data-id="${esc(s.id)}"><i class="dot" style="background:${typeColor(s.type)}"></i><span class="grow">${esc(s.name)}<small>${esc(s.sido)} ${esc(s.sgg)}</small></span><i>›</i></button>`).join(''))
      + (zonesHTML ?? '<div class="rg-sec">정비구역</div><div class="meta rg-wait">찾는 중…</div>')
      + (placesHTML ?? '<div class="rg-sec">동·단지·장소</div><div class="meta rg-wait">찾는 중…</div>');
    if (R.q === q) body.innerHTML = html || '<div class="empty">검색 결과가 없어요</div>';
  };
  draw(null, null);
  // 정비구역 (전국 자료에서 이름으로)
  let zonesHTML = '', placesHTML = '';
  const zp = loadAllZones().then((all) => {
    const hits = all.filter((z) => z.n && norm(z.n).includes(nq)).sort((a, b) => (zDone(a) - zDone(b)) || b.a - a.a).slice(0, 12);
    R._zoneHits = hits;
    zonesHTML = sec('정비구역', hits.map((z) => {
      const g = Z.meta.sgg[z.code] || {};
      return `<button class="rg-row" data-go="zone" data-zid="${esc(z.id)}"><i class="dot" style="background:${zColor(z)}"></i><span class="grow">${esc(zTitle(z))}<small>${esc([g.sd, g.n].filter(Boolean).join(' '))} · ${esc(zStage(z))}</small></span><i>›</i></button>`;
    }).join(''));
  });
  // 카카오 장소 검색 (동·단지·역)
  const pp = (window.kakao && kakao.maps.services ? Kakao.keyword(q) : Promise.resolve([])).then((res) => {
    R._places = res.slice(0, 6);
    placesHTML = sec('동·단지·장소', R._places.map((p, i) => `<button class="rg-row" data-go="place" data-i="${i}"><span class="grow">${esc(p.place_name)}<small>${esc(p.road_address_name || p.address_name)}</small></span><i>›</i></button>`).join(''));
  });
  await zp; draw(zonesHTML, null);
  await pp; draw(zonesHTML, placesHTML);
}

// ---------- 이동 ----------
async function geocodeOnce(key, q) {
  let v = Geo.get('rg|' + key);
  if (v === undefined) {
    let r = await Kakao.addressSearch(q);
    if (!r.length) r = await Kakao.keyword(q);
    v = r.length ? [+r[0].y, +r[0].x] : 0; Geo.put('rg|' + key, v);
  }
  return pt(v);
}
function moveTo(p, level) {
  if (!S.map || !p) return;
  S.map.setLevel(level);
  S.map.setCenter(new kakao.maps.LatLng(p.lat, p.lng));
}
function closeOnMobile() { if (innerWidth < 900) openDrawer(false); }

async function onDrawerClick(e) {
  const sdBtn = e.target.closest('[data-sd]:not([data-go])');
  if (sdBtn) { R.sd = sdBtn.dataset.sd; renderDrawer(); goSido(R.sd); return; }
  const b = e.target.closest('[data-go]'); if (!b) return;
  const go = b.dataset.go;
  if (go === 'sido') { R.q = ''; $('#q').value = ''; R.sd = b.dataset.sd; renderDrawer(); goSido(b.dataset.sd); closeOnMobile(); return; }
  if (go === 'sgg') {
    const v = S.meta.codes[b.dataset.code]; if (!v) return;
    closeSite(); closeOnMobile();
    const zb = Z.meta?.sgg[b.dataset.code]?.bb;
    const p = await geocodeOnce(b.dataset.code, `${SIDO_FULL[v.sd] || v.sd} ${v.n}`);
    if (p) moveTo(p, 7); else if (zb) moveTo({ lat: (zb[0] + zb[2]) / 2, lng: (zb[1] + zb[3]) / 2 }, 7);
    $$('#drBody .rg-cell.on').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    return;
  }
  if (go === 'site') { closeOnMobile(); selectSite(b.dataset.id); return; }
  if (go === 'zone') {
    const z = (R._zoneHits || []).find((x) => x.id === b.dataset.zid); if (!z) return;
    closeOnMobile(); moveTo(z.c, z.a > 150000 ? 5 : 4); setTimeout(() => selectZone(z), 60); return;
  }
  if (go === 'place') {
    const p = R._places?.[+b.dataset.i]; if (!p) return;
    closeSite(); closeOnMobile(); moveTo({ lat: +p.y, lng: +p.x }, 4); return;
  }
}
async function goSido(sd) {
  closeSite();
  const p = await geocodeOnce('sd|' + sd, SIDO_FULL[sd] || sd);
  moveTo(p, SIDO_LEVEL[sd] || 11);
}

// ---------- 현재 위치 지역명 (상단 검색창에 표시) ----------
function updateWhere() {
  clearTimeout(R.whereT);
  R.whereT = setTimeout(async () => {
    if (!S.map) return;
    const lvl = S.map.getLevel();
    if (lvl > 11) { $('#where').textContent = '전국'; return; }
    const c = S.map.getCenter ? S.map.getCenter() : null; if (!c) return;
    const r = (await Kakao.regionCodes({ lat: c.getLat(), lng: c.getLng() })).find((x) => x.region_type === 'B');
    if (!r) return;
    const sd = r.region_1depth_name.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '').replace(/^(충청|전라|경상)(남|북)$/, (m, a, b) => ({ 충청: '충', 전라: '전', 경상: '경' }[a] + b));
    $('#where').textContent = [sd, lvl <= 9 ? r.region_2depth_name : '', lvl <= 6 ? r.region_3depth_name : ''].filter(Boolean).join(' ');
  }, 250);
}
