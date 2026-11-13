/* 정비맵 — 당사 정비사업장 주변 시세·청약·공급
   자료: 분양시장 레이더(국토부 실거래가·청약홈)를 매일 받아 만든 data/*.json
   지도·주소 찾기: 카카오맵 JavaScript API (무료 한도 안에서 사용, 찾은 위치는 이 기기에 저장) */
'use strict';

const BUILTIN_KAKAO_KEY = '76e1f2c0c1f996041b2d1c9441792ea1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('jm_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('jm_' + k, JSON.stringify(v)); } catch (e) { /* 저장 공간 부족 */ } }
};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400); }

const settings = Object.assign({ kakaoKey: '', radius: 1000, chRadius: 5000 }, LS.get('settings', {}));
const kakaoKey = () => settings.kakaoKey || BUILTIN_KAKAO_KEY;
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const NOW_YM = TODAY.slice(0, 4) + TODAY.slice(5, 7);
const THIS_YEAR = +TODAY.slice(0, 4);
const RADII = [500, 1000, 2000, 3000];
const CH_RADII = [3000, 5000, 10000];
const GEO_MAX = 3000; // 단지 위치는 이 반경까지 찾아 둠

// ---------- 형식 ----------
const fmtN = (v) => (v == null ? '–' : Math.round(v).toLocaleString('ko-KR'));
function fmtEok(v) { // 만원 → 억
  if (v == null) return '–';
  if (v < 10000) return fmtN(v) + '만';
  const e = v / 10000; return (e >= 100 ? e.toFixed(0) : e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, '') + '억';
}
const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(1) + 'km');
const fmtR = (m) => (m < 1000 ? m + 'm' : m / 1000 + 'km');
const fmtDate = (s) => (s ? s.slice(2).replace(/-/g, '.') : '–');
const fmtYm = (s) => (s ? s.slice(2, 4) + '.' + s.slice(4, 6) : '–');
const ageCls = (by) => (!by ? '' : THIS_YEAR - by <= 5 ? 'n' : THIS_YEAR - by <= 10 ? 'm' : '');
const typeColor = (t) => (/소규모|가로|모아/.test(t) ? 'var(--t-small)' : /재건축/.test(t) ? 'var(--t-recon)' : 'var(--t-redev)');
const typeShort = (t) => (/가로|모아/.test(t) ? '가로주택' : /소규모/.test(t) ? '소규모재건축' : /재건축/.test(t) ? '재건축' : '재개발');
function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function offset(p, m, deg) { // p에서 deg 방향으로 m 이동
  const r = Math.PI / 180;
  return { lat: p.lat + (m * Math.cos(deg * r)) / 111320, lng: p.lng + (m * Math.sin(deg * r)) / (111320 * Math.cos(p.lat * r)) };
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
async function getJSON(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

// ---------- 링크 ----------
const Links = {
  naverLand: (q) => `https://m.land.naver.com/search/result/${encodeURIComponent(q)}`,
};

// ---------- 카카오 ----------
const Kakao = {
  _p: null,
  load(key) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
      s.onload = () => { try { kakao.maps.load(() => resolve(true)); } catch (e) { resolve(false); } };
      s.onerror = () => { s.remove(); resolve(false); };
      document.head.appendChild(s);
      setTimeout(() => resolve(!!(window.kakao && kakao.maps && kakao.maps.services)), 9000);
    });
  },
  ready() {
    if (this._p) return this._p;
    this._p = (async () => {
      let ok = await this.load(kakaoKey());
      if (!ok && settings.kakaoKey) { try { delete window.kakao; } catch (e) { window.kakao = undefined; } ok = await this.load(BUILTIN_KAKAO_KEY); }
      return ok;
    })();
    return this._p;
  },
  ok: (st) => st === kakao.maps.services.Status.OK,
  regionCodes(p) {
    return new Promise((res) => new kakao.maps.services.Geocoder().coord2RegionCode(p.lng, p.lat, (r, st) => res(Kakao.ok(st) ? r : [])));
  },
  address(p) {
    return new Promise((res) => new kakao.maps.services.Geocoder().coord2Address(p.lng, p.lat, (r, st) => {
      if (!Kakao.ok(st) || !r.length) return res('');
      res((r[0].road_address && r[0].road_address.address_name) || (r[0].address && r[0].address.address_name) || '');
    }));
  },
  addressSearch(q) {
    return new Promise((res) => new kakao.maps.services.Geocoder().addressSearch(q, (r, st) => res(Kakao.ok(st) ? r : [])));
  },
  keyword(q, opt = {}) {
    return new Promise((res) => new kakao.maps.services.Places().keywordSearch(q, (r, st) => res(Kakao.ok(st) ? r : []), opt));
  }
};

// 찾은 위치 보관 (키 → [위도, 경도] 또는 0=못 찾음)
const Geo = {
  db: LS.get('geo', {}),
  _dirty: false,
  get(k) { return this.db[k]; },
  put(k, v) { this.db[k] = v; this._dirty = true; clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 800); },
  flush() { if (this._dirty) { LS.set('geo', this.db); this._dirty = false; } }
};
const pt = (v) => (v ? { lat: v[0], lng: v[1] } : null);

// ---------- 상태 ----------
const S = {
  sites: [], meta: null, map: null, sel: null, sheetTab: 'info', sort: 'dist',
  siteMarks: {}, layer: [], circle: null, me: null, meMark: null, fix: false,
  near: {}, ch: {}, an: null, // an: 현재 사업장 분석 결과
  saved: LS.get('saved', []), sitePos: LS.get('sitePos', {}), siteArea: LS.get('siteArea', {}), areaOv: {}, draw: null, cadastral: false, siteFilter: '전체', calFilter: '전체'
};
const sitePoint = (s) => S.sitePos[s.id] ? { lat: S.sitePos[s.id][0], lng: S.sitePos[s.id][1] } : { lat: s.lat, lng: s.lng };

// ---------- 시작 ----------
async function init() {
  bindUI();
  try {
    const [sites, meta] = await Promise.all([getJSON('data/sites.json'), getJSON('data/meta.json').catch(() => null)]);
    S.sites = sites.sites; S.meta = meta;
    if (meta) $('#asOf').textContent = `실거래 ${fmtYm(meta.tradeTo)}까지 · ${meta.builtAt.slice(5, 10).replace('-', '.')} 갱신`;
  } catch (e) { $('#mapMsg').textContent = '사업장 자료를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'; return; }
  renderChips(); renderSites(); renderSaved();
  const ok = await Kakao.ready();
  if (!ok) { $('#mapMsg').innerHTML = '카카오 지도를 불러오지 못했어요.<br>인터넷 연결을 확인하거나 ⚙️ 설정에서 카카오 키를 확인해 주세요.'; return; }
  $('#mapMsg').remove();
  S.map = new kakao.maps.Map($('#map'), { center: new kakao.maps.LatLng(36.6, 127.8), level: 12 });
  S.map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
  kakao.maps.event.addListener(S.map, 'click', (e) => { if (S.draw) addVertex(e.latLng); else if (S.fix) moveSite(e.latLng); });
  kakao.maps.event.addListener(S.map, 'zoom_changed', () => drawLayer());
  drawSites();
  drawAreas();
  refineSites();
  zonesInit();
  const id = decodeURIComponent((location.hash.match(/site=([^&]+)/) || [])[1] || '');
  if (id && S.sites.find((s) => s.id === id)) selectSite(id); else fitAll();
  addEventListener('hashchange', () => { const m = location.hash.match(/site=([^&]+)/); if (m && decodeURIComponent(m[1]) !== S.sel?.id) selectSite(decodeURIComponent(m[1])); });
}

function bindUI() {
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });
  $('#stabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.sheetTab = b.dataset.t; $$('#stabs button').forEach((x) => x.classList.toggle('on', x === b)); renderSheetBody(); setSheet('open'); });
  $('#handle').addEventListener('click', () => setSheet($('#sheet').classList.contains('open') ? 'show' : 'open'));
  $('#shHead').addEventListener('click', (e) => { if (e.target.closest('.x')) return closeSite(); if (!$('#sheet').classList.contains('open')) setSheet('open'); });
  $('#btnAll').addEventListener('click', () => { closeSite(); fitAll(); });
  $('#btnSet').addEventListener('click', openSettings);
  $('#btnZone').addEventListener('click', () => toggleZonePanel());
  $('#btnMe').addEventListener('click', locateMe);
  $('#btnCad').addEventListener('click', () => setCadastral(!S.cadastral));
  $('#drawBar').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) drawAct(b.dataset.d); });
  $('#fixDone').addEventListener('click', () => endFix());
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  // 시트 끌어 올리기/내리기 (휴대폰)
  let y0 = null;
  const sh = $('#sheet');
  sh.addEventListener('touchstart', (e) => { if (e.target.closest('.handle,.sh-head')) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchend', (e) => {
    if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy < -30) setSheet(sh.classList.contains('open') ? 'full' : 'open'); else if (dy > 30) setSheet(sh.classList.contains('full') ? 'open' : 'show');
  });
}

function showView(v) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $$('.view').forEach((el) => el.classList.toggle('on', el.id === 'v-' + v));
  if (v === 'map' && S.map) setTimeout(() => S.map.relayout(), 30);
  if (v === 'cal') renderCal();
  if (v === 'saved') renderSaved();
}

// ---------- 사업장 ----------
function renderChips() {
  $('#siteChips').innerHTML = S.sites.map((s) =>
    `<button class="chip" data-id="${esc(s.id)}" style="--c:${typeColor(s.type)}"><i></i>${esc(s.name)}</button>`).join('');
  $('#siteChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) selectSite(b.dataset.id); };
}
function renderSites() {
  const kinds = ['전체', '재개발', '재건축', '소규모·가로'];
  $('#siteFilter').innerHTML = kinds.map((k) => `<button class="${k === S.siteFilter ? 'on' : ''}" data-k="${k}">${k}</button>`).join('');
  $('#siteFilter').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.siteFilter = b.dataset.k; renderSites(); } };
  const list = S.sites.filter((s) => S.siteFilter === '전체' || (S.siteFilter === '소규모·가로' ? /소규모|가로|모아/.test(s.type) : typeShort(s.type) === S.siteFilter));
  $('#siteList').innerHTML = list.map((s) => {
    const d = S.me ? `<span class="meta"> · ${fmtDist(dist(S.me, sitePoint(s)))}</span>` : '';
    return `<div class="card" data-id="${esc(s.id)}">
      <div class="row"><div class="grow"><span class="badge" style="--c:${typeColor(s.type)}">${esc(s.type)}</span><span class="meta">${esc(s.sido)} ${esc(s.sgg)} ${esc(s.dong)}</span>${d}</div></div>
      <div style="font-size:17px;font-weight:800;margin:6px 0 4px;letter-spacing:-.3px">${esc(s.name)}</div>
      <div class="meta">${fmtN(s.households)}세대 · 시공 ${esc(s.builder)} · ${esc(s.stage)}</div>
    </div>`;
  }).join('') || '<div class="empty">해당하는 사업장이 없어요</div>';
  $('#siteList').onclick = (e) => { const c = e.target.closest('.card'); if (c) { showView('map'); selectSite(c.dataset.id); } };
}

function drawSites() {
  for (const s of S.sites) {
    const el = document.createElement('div');
    el.className = 'mk-site'; el.style.setProperty('--c', typeColor(s.type));
    el.innerHTML = `🏗️ ${esc(s.name)}`;
    el.onclick = (e) => { e.stopPropagation(); selectSite(s.id); };
    const p = sitePoint(s);
    const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(p.lat, p.lng), content: el, yAnchor: 1, zIndex: 20 });
    ov.setMap(S.map); S.siteMarks[s.id] = { ov, el };
  }
}
function placeSite(s) { const m = S.siteMarks[s.id]; if (m) { const p = sitePoint(s); m.ov.setPosition(new kakao.maps.LatLng(p.lat, p.lng)); } }

// 이름이 분명한 단지(q)는 카카오 장소 검색으로 위치를 다시 잡음 (주소에 동 이름이 들어간 결과만)
async function refineSites() {
  for (const s of S.sites) {
    if ((!s.q && !s.addr) || s.area || S.sitePos[s.id]) continue;
    const k = 'site|' + s.id + '|' + (s.addr || s.q);
    let v = Geo.get(k);
    if (v === undefined) {
      let hit = null;
      if (s.addr) { const r = await Kakao.addressSearch(s.addr); if (r.length) hit = r[0]; }
      if (!hit && s.q) { const r = await Kakao.keyword(s.q, { location: new kakao.maps.LatLng(s.lat, s.lng), radius: 5000 }); hit = r.find((x) => (x.address_name || '').includes(s.dong)); }
      v = hit ? [+hit.y, +hit.x] : 0; Geo.put(k, v);
    }
    if (v) { s.lat = v[0]; s.lng = v[1]; placeSite(s); }
  }
}

function fitAll() {
  if (!S.map) return;
  const b = new kakao.maps.LatLngBounds();
  S.sites.forEach((s) => { const p = sitePoint(s); b.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
  S.map.setBounds(b, 90, 40, 60, 40);
}

async function selectSite(id) {
  const s = typeof id === 'object' ? id : S.sites.find((x) => x.id === id); if (!s) return;
  if (!s.zone) clearZoneSel();
  id = s.id;
  if (!$('#v-map').classList.contains('on')) showView('map');
  S.sel = s; S.sheetTab = S.sheetTab || 'info';
  history.replaceState(null, '', s.zone ? location.pathname : '#site=' + encodeURIComponent(id));
  $$('#siteChips .chip').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $(`#siteChips .chip[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  Object.entries(S.siteMarks).forEach(([k, m]) => { m.el.classList.toggle('sel', k === id); m.el.classList.toggle('dim', !s.zone && k !== id); });
  if (!S.map) return;
  const p = sitePoint(s);
  if (s.zone && S.map.getLevel() <= levelFor(settings.radius)) S.map.panTo(new kakao.maps.LatLng(p.lat - latShift(settings.radius) * S.map.getLevel() / levelFor(settings.radius), p.lng));
  else { S.map.setLevel(levelFor(settings.radius)); S.map.setCenter(new kakao.maps.LatLng(p.lat - latShift(settings.radius), p.lng)); }
  drawCircle(); if (S.map) drawAreas();
  S.an = { site: s, status: '주변 자료 찾는 중…', prog: 0, cx: null, ch: null, addr: '' };
  renderSheet(); setSheet('show');
  Kakao.address(p).then((a) => { if (S.an && S.an.site === s) { S.an.addr = a; if (S.sheetTab === 'info') renderSheetBody(); } });
  analyze(s);
}
function closeSite() {
  S.sel = null; S.an = null; clearLayer(); clearZoneSel();
  if (S.circle) { S.circle.setMap(null); S.circle = null; }
  Object.values(S.siteMarks).forEach((m) => m.el.classList.remove('sel', 'dim'));
  $$('#siteChips .chip').forEach((b) => b.classList.remove('on'));
  history.replaceState(null, '', location.pathname);
  setSheet('hide');
}
const levelFor = (r) => (r <= 500 ? 4 : r <= 1000 ? 5 : r <= 2000 ? 6 : 7);
const latShift = (r) => (innerWidth >= 900 ? 0 : r * 0.55 / 111320);

function drawCircle() {
  if (S.circle) S.circle.setMap(null);
  const p = sitePoint(S.sel);
  S.circle = new kakao.maps.Circle({ center: new kakao.maps.LatLng(p.lat, p.lng), radius: settings.radius, strokeWeight: 2, strokeColor: '#1d5fd1', strokeOpacity: .8, strokeStyle: 'shortdash', fillColor: '#1d5fd1', fillOpacity: .06 });
  S.circle.setMap(S.map);
}

function setSheet(st) {
  const sh = $('#sheet');
  sh.classList.toggle('show', st !== 'hide');
  sh.classList.toggle('open', st === 'open' || st === 'full');
  sh.classList.toggle('full', st === 'full');
  const peek = $('#handle').offsetHeight + $('#shHead').offsetHeight + $('#stabs').offsetHeight;
  sh.style.setProperty('--peek', peek + 'px');
  const desk = innerWidth >= 900;
  const h = st === 'hide' || desk ? 0 : st === 'show' ? peek : sh.offsetHeight;
  $('#fabs').style.bottom = (h + 14) + 'px';
  $('#legend').style.bottom = (h + 14) + 'px';
  $('#legend').classList.toggle('on', st !== 'hide' && (desk || st === 'show'));
}

// ---------- 주변 분석 ----------
async function codesAround(p, R) {
  const pts = [p, ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => offset(p, R, d))];
  const codes = new Set();
  await pool(pts, 4, async (q) => {
    for (const r of await Kakao.regionCodes(q)) {
      if (r.region_type !== 'B') continue;
      let c = r.code.slice(0, 5);
      if (S.meta && !S.meta.codes[c]) { // 행정구역 개편 등으로 코드가 다르면 이름으로 찾기
        const nm = (r.region_2depth_name || '').split(' ')[0];
        c = Object.keys(S.meta.codes).find((k) => S.meta.codes[k].n === nm && k.slice(0, 2) === c.slice(0, 2)) || c;
      }
      codes.add(c);
    }
  });
  return [...codes].filter((c) => !S.meta || S.meta.codes[c]);
}
async function loadNear(code) {
  if (!S.near[code]) S.near[code] = getJSON(`data/near/${code}.json`).catch(() => null);
  return S.near[code];
}
async function loadCh(sido) {
  if (!S.ch[sido]) S.ch[sido] = getJSON(`data/cheongyak/${encodeURIComponent(sido)}.json`).then((d) => d.items || []).catch(() => []);
  return S.ch[sido];
}

async function analyze(s) {
  const an = S.an, p = sitePoint(s);
  const alive = () => S.an === an;
  const setProg = (txt, v) => { if (!alive()) return; an.status = txt; an.prog = v; const pr = $('#shBody .prog i'); if (pr) { pr.style.width = Math.round(v * 100) + '%'; $('#shBody .stat').textContent = txt; } else renderSheetBody(); };
  try {
    // 1) 반경에 걸치는 시군구 찾기
    const codes = await codesAround(p, Math.max(GEO_MAX, settings.chRadius) + 500);
    const nearCodes = await codesAround(p, GEO_MAX + 300);
    if (!alive()) return;
    // 2) 단지 실거래 요약 읽기
    const files = (await Promise.all(nearCodes.map(loadNear))).filter(Boolean);
    const rows = [];
    for (const f of files) for (const r of f.cx) rows.push({ code: f.code, n: f.n, sd: f.sd, apt: r[0], dong: r[1], by: r[2], n12: r[3], py12: r[4], amt12: r[5], n36: r[6], py36: r[7], last: r[8], q: r[9], deals: r[10], quarters: f.quarters });
    // 3) 법정동 위치로 1차 거르기
    const dongs = [...new Map(rows.map((r) => [r.code + '|' + r.dong, r])).values()];
    let done = 0;
    await pool(dongs, 5, async (r) => {
      const k = 'dong|' + r.code + '|' + r.dong;
      if (Geo.get(k) === undefined) {
        let res = await Kakao.addressSearch(`${r.n} ${r.dong}`);
        if (!res.length) res = await Kakao.keyword(`${r.n} ${r.dong}`);
        Geo.put(k, res.length ? [+res[0].y, +res[0].x] : 0);
      }
      setProg('동네 위치 확인 중…', (++done / dongs.length) * 0.25);
    });
    if (!alive()) return;
    const keepDong = new Set(dongs.filter((r) => { const g = pt(Geo.get('dong|' + r.code + '|' + r.dong)); return g && dist(p, g) <= GEO_MAX + 1800; }).map((r) => r.code + '|' + r.dong));
    const cand = rows.filter((r) => keepDong.has(r.code + '|' + r.dong));
    // 4) 단지 위치 찾기 (이 기기에 저장해 두고 다음부터는 바로)
    done = 0;
    const center = new kakao.maps.LatLng(p.lat, p.lng);
    await pool(cand, 6, async (r) => {
      const k = 'cx|' + r.code + '|' + r.dong + '|' + r.apt;
      if (Geo.get(k) === undefined) {
        const name = r.apt.replace(/\(.*?\)/g, ' ').trim();
        let res = await Kakao.keyword(`${r.dong} ${name}`, { location: center, radius: 20000 });
        let hit = res.find((x) => /아파트|주거/.test(x.category_name) && (x.address_name || '').includes(r.dong)) || res.find((x) => (x.address_name || '').includes(r.dong));
        if (!hit && name !== r.apt) { res = await Kakao.keyword(`${r.dong} ${r.apt}`, { location: center, radius: 20000 }); hit = res.find((x) => (x.address_name || '').includes(r.dong)); }
        Geo.put(k, hit ? [+hit.y, +hit.x] : 0);
      }
      const g = pt(Geo.get(k)); if (g) { r.lat = g.lat; r.lng = g.lng; r.d = dist(p, g); }
      done++; if (done % 4 === 0 || done === cand.length) setProg(`단지 위치 확인 중… ${done}/${cand.length}`, 0.25 + (done / Math.max(1, cand.length)) * 0.6);
    });
    if (!alive()) return;
    an.cx = cand.filter((r) => r.d != null && r.d <= GEO_MAX);
    an.missing = cand.filter((r) => r.d == null).length;
    // 5) 청약·공급
    setProg('청약·공급 단지 확인 중…', 0.88);
    const sidoSet = new Set(codes.map((c) => S.meta?.codes[c]?.sd).filter(Boolean));
    const nameSet = new Set(codes.map((c) => S.meta?.codes[c]?.n).filter(Boolean));
    const items = (await Promise.all([...sidoSet].map(loadCh))).flat();
    const chCand = items.filter((it) => [...nameSet].some((n) => (it.sgg || '').includes(n) || (it.addr || '').includes(n)));
    await pool(chCand, 5, async (it) => {
      const k = 'ch|' + it.id;
      if (Geo.get(k) === undefined) {
        const a = (it.addr || '').replace(/\(.*?\)/g, ' ').replace(/번지|일원|일대|외\s*\d+\s*필지|\s+외$/g, ' ').replace(/\s+/g, ' ').trim();
        let res = await Kakao.addressSearch(a);
        if (!res.length) res = await Kakao.addressSearch(a.split(' ').slice(0, -1).join(' '));
        if (!res.length) res = await Kakao.keyword(it.name, { location: center, radius: 20000 });
        Geo.put(k, res.length ? [+res[0].y, +res[0].x] : 0);
      }
      const g = pt(Geo.get(k)); if (g) { it.lat = g.lat; it.lng = g.lng; it.d = dist(p, g); }
    });
    if (!alive()) return;
    an.ch = chCand.filter((it) => it.d != null && it.d <= 10000);
    Geo.flush();
    an.status = ''; an.prog = 1;
    renderSheet(); drawLayer(); zonesRefresh();
  } catch (e) {
    console.error(e);
    if (alive()) { an.status = '주변 자료를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'; an.err = true; renderSheetBody(); }
  }
}

// 반경 안 단지 요약
function summary() {
  const an = S.an; if (!an || !an.cx) return null;
  const inR = an.cx.filter((r) => r.d <= settings.radius);
  const w = (arr) => { let n = 0, s = 0; for (const r of arr) if (r.py12 && r.n12) { n += r.n12; s += r.py12 * r.n12; } return n ? { v: s / n, n } : null; };
  const all = w(inR), nw = w(inR.filter((r) => r.by && THIS_YEAR - r.by <= 10));
  const chs = (an.ch || []).filter((it) => it.d <= settings.chRadius);
  const recent = chs.filter((it) => it.date >= `${THIS_YEAR - 2}-01-01`);
  let sn = 0, ss = 0; for (const it of recent) for (const t of it.types || []) if (t[0] && t[2]) { sn += t[3] || 1; ss += (t[2] / (t[0] / 3.3058)) * (t[3] || 1); }
  return { inR, all, nw, sale: sn ? ss / sn : null, chs };
}

// ---------- 시트 그리기 ----------
function renderSheet() {
  const s = S.sel; if (!s) return;
  const sm = summary();
  const k = (lbl, v, unit) => `<div class="kpi"><small>${lbl}</small><b class="num">${v}${unit ? `<em>${unit}</em>` : ''}</b></div>`;
  $('#shHead').innerHTML = `
    <div class="sh-title"><h2>${esc(s.name)}</h2><button class="x" title="닫기">✕</button></div>
    <div class="sh-sub">${s.zone ? `<span class="badge" style="--c:${zColor(s.zone)}">${esc(zShort(s.zone))}</span>${esc(s.stage)} · ${fmtN(s.zone.a / 3.3058)}평` : `<span class="badge" style="--c:${typeColor(s.type)}">${esc(s.type)}</span>${fmtN(s.households)}세대 · ${esc(s.stage)}`}</div>
    <div class="kpis">
      ${k(`${fmtR(settings.radius)} 평균 평당`, sm?.all ? fmtN(sm.all.v) : (S.an?.cx ? '–' : '…'), sm?.all ? '만' : '')}
      ${k('10년 이내 평당', sm?.nw ? fmtN(sm.nw.v) : (S.an?.cx ? '–' : '…'), sm?.nw ? '만' : '')}
      ${k(`최근 분양 평당 ${fmtR(settings.chRadius)}`, sm?.sale ? fmtN(sm.sale) : (S.an?.ch ? '–' : '…'), sm?.sale ? '만' : '')}
    </div>`;
  $$('#stabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.sheetTab));
  renderSheetBody();
  const sh = $('#sheet'); if (sh.classList.contains('show') && !sh.classList.contains('open')) setSheet('show');
}

function renderSheetBody() {
  const s = S.sel, an = S.an; if (!s || !an) return;
  const body = $('#shBody');
  const loading = an.status ? `<div class="meta stat">${esc(an.status)}</div>${an.err ? '' : `<div class="prog"><i style="width:${Math.round(an.prog * 100)}%"></i></div>`}` : '';
  if (S.sheetTab === 'info') body.innerHTML = infoHTML(s, an) + loading;
  else if (S.sheetTab === 'price') body.innerHTML = (an.cx ? priceHTML() : loading || '<div class="empty">불러오는 중…</div>');
  else body.innerHTML = (an.ch ? supplyHTML() : loading || '<div class="empty">불러오는 중…</div>');
  bindBody();
}

function infoHTML(s, an) {
  if (s.zone) return zoneInfoHTML(s, an);
  return `
    <dl class="dl">
      <dt>사업유형</dt><dd>${esc(s.type)}</dd>
      <dt>소재지</dt><dd>${esc(an.addr || `${s.sido} ${s.sgg} ${s.dong} 일대`)}</dd>
      <dt>계획 세대수</dt><dd>${fmtN(s.households)}세대</dd>
      <dt>시공사</dt><dd>${esc(s.builder)}</dd>
      <dt>진행 단계</dt><dd>${esc(s.stage)}</dd>
      <dt>당사 역할</dt><dd>${esc(s.role || '-')}</dd>
      <dt>구역 면적</dt><dd>${areaOf(s) ? fmtArea(areaOf(s)) + (S.siteArea[s.id] ? ' <span class="meta">(이 기기에서 그림)</span>' : s.areaSrc ? `<div class="meta" style="font-weight:500">${esc(s.areaSrc)}</div>` : '') : '<span class="meta">경계 미입력 · ✏️ 구역 그리기로 입력</span>'}</dd>
    </dl>
    <div class="btns">
      <button class="btn" data-act="fix">📌 위치 맞추기</button>
      <button class="btn" data-act="draw">✏️ 구역 ${areaPath(s) ? '다시 ' : ''}그리기</button>
    </div>
    <div class="note">기준: 사업장 정보 2026.10 · 지도 위 위치는 대략적인 위치예요${S.sitePos[s.id] ? ' (이 기기에서 옮긴 위치 사용 중)' : ''}. 시세는 국토교통부 실거래가(전용면적 기준 평당가, 최근 12개월 거래 가중평균)입니다.</div>`;
}

function spark(vals) {
  const pts = vals.map((v, i) => [i, v]).filter((x) => x[1] != null);
  if (pts.length < 2) return '';
  const min = Math.min(...pts.map((x) => x[1])), max = Math.max(...pts.map((x) => x[1])), W = 300, H = 46, pad = 5;
  const X = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2), Y = (v) => H - pad - (max === min ? .5 : (v - min) / (max - min)) * (H - pad * 2);
  const d = pts.map((x, k) => (k ? 'L' : 'M') + X(x[0]).toFixed(1) + ' ' + Y(x[1]).toFixed(1)).join(' ');
  const lastP = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${X(lastP[0])}" cy="${Y(lastP[1])}" r="3" fill="var(--accent)"/></svg>`;
}
const isSaved = (kind, id) => S.saved.some((x) => x.kind === kind && x.id === id);
const cxId = (r) => r.code + '|' + r.dong + '|' + r.apt;

function priceHTML() {
  const sm = summary(), an = S.an;
  let list = sm.inR.slice();
  if (S.sort === 'dist') list.sort((a, b) => a.d - b.d);
  else if (S.sort === 'price') list.sort((a, b) => (b.py12 || b.py36 || 0) - (a.py12 || a.py36 || 0));
  else list.sort((a, b) => (b.by || 0) - (a.by || 0) || a.d - b.d);
  const top = sm.inR.filter((r) => r.py12).sort((a, b) => b.py12 - a.py12)[0];
  const head = `<div class="tools">
      <div class="seg"><span class="lbl">반경</span>${RADII.map((r) => `<button data-r="${r}" class="${r === settings.radius ? 'on' : ''}">${fmtR(r)}</button>`).join('')}</div>
      <div class="seg"><span class="lbl">정렬</span>${[['dist', '가까운순'], ['price', '평당가순'], ['new', '신축순']].map(([k, l]) => `<button data-sort="${k}" class="${k === S.sort ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="meta" style="margin:0 2px 6px">반경 ${fmtR(settings.radius)} 안 ${list.length}개 단지${top ? ` · 최고 <b>${esc(top.apt)}</b> ${fmtN(top.py12)}만/평` : ''}</div>`;
  if (!list.length) return head + '<div class="empty">반경 안에서 최근 3년 거래된 아파트를 찾지 못했어요.<br>반경을 넓혀 보세요.</div>';
  return head + list.map((r) => {
    const id = cxId(r), cls = ageCls(r.by);
    const deals = (r.deals || []).map((d) => `<tr><td>${d[0].slice(2, 4)}.${d[0].slice(4, 6)}.${d[0].slice(6, 8)}</td><td>전용 ${d[1]}㎡</td><td>${d[2] ?? '-'}층</td><td>${fmtEok(d[3])}</td></tr>`).join('');
    return `<div class="item" data-cx="${esc(id)}">
      <div class="row">
        <div class="grow"><div class="nm">${esc(r.apt)}</div>
          <div class="meta"><span class="badge age ${cls}">${r.by ? `${r.by}년 · ${THIS_YEAR - r.by}년차` : '준공 미상'}</span>${esc(r.dong)} · ${fmtDist(r.d)}</div></div>
        <div class="pr num">${r.py12 ? fmtN(r.py12) + '만' : `<span style="color:var(--sub)">${fmtN(r.py36)}만</span>`}<small>${r.py12 ? `평당 · 12개월 ${r.n12}건` : `36개월 ${r.n36}건 · 최근 ${fmtYm(r.last)}`}</small></div>
      </div>
      <div class="more">
        <div class="meta">분기별 평당가 (${esc(r.quarters[0])}~${esc(r.quarters[r.quarters.length - 1])})</div>
        ${spark(r.q)}
        ${deals ? `<table class="deals num">${deals}</table>` : '<div class="meta" style="margin:6px 0 10px">개별 거래 내역은 지역 상위 단지만 보관돼요. 12개월 대표 거래가 ' + fmtEok(r.amt12) + '</div>'}
        <div class="btns">
          <a class="btn sm" href="${Links.naverLand(r.n + ' ' + r.apt)}" target="_blank" rel="noopener">네이버부동산</a>
          <button class="star ${isSaved('cx', id) ? 'on' : ''}" data-save="cx" data-id="${esc(id)}" title="저장">★</button>
        </div>
      </div>
    </div>`;
  }).join('') + (an.missing ? `<div class="note">지도에서 위치를 찾지 못한 단지 ${an.missing}곳은 빠졌어요 (이름이 지도와 다른 단지).</div>` : '');
}

function chCard(it, withDist = true) {
  const ty = it.types || [];
  const prices = ty.map((t) => t[2]).filter(Boolean);
  let sn = 0, ss = 0; for (const t of ty) if (t[0] && t[2]) { sn += t[3] || 1; ss += (t[2] / (t[0] / 3.3058)) * (t[3] || 1); }
  let sg = 0, sgs = 0; for (const t of ty) if (t[1] && t[2]) { sg += t[3] || 1; sgs += (t[2] / (t[1] / 3.3058)) * (t[3] || 1); }
  const comp = it.comp && it.comp.avg1 != null ? `1순위 평균 ${it.comp.avg1}:1` : it.rcept >= TODAY ? '접수 전' : it.comp ? '경쟁률 집계 중' : '';
  const st = it.rcept > TODAY ? ['접수 예정', 'var(--ch)'] : it.winner >= TODAY ? ['진행 중', 'var(--warn)'] : ['분양 완료', 'var(--old)'];
  return `<div class="item" data-ch="${esc(it.id)}">
    <div class="row"><div class="grow">
      <div class="nm">${esc(it.name)}</div>
      <div class="meta"><span class="badge" style="--c:${st[1]}">${st[0]}</span>${esc(it.kind || '')} · ${fmtN(it.total)}세대${withDist && it.d != null ? ' · ' + fmtDist(it.d) : ''}</div>
    </div><div class="pr num">${sn ? fmtN(ss / sn) + '만' : '–'}<small>전용 평당 분양가</small></div></div>
    <div class="meta" style="margin-top:5px">접수 ${fmtDate(it.rcept)} · 발표 ${fmtDate(it.winner)} · 입주 ${it.mvn ? fmtYm(it.mvn) : '–'}${comp ? ' · ' + comp : ''}</div>
    <div class="more">
      <div class="meta">${esc(it.addr)} · ${esc(it.builder || '')}</div>
      <div class="meta" style="margin:4px 0 10px">분양가 ${prices.length ? fmtEok(Math.min(...prices)) + ' ~ ' + fmtEok(Math.max(...prices)) : '–'}${sg ? ` · 공급면적 평당 ${fmtN(sgs / sg)}만` : ''}</div>
      <div class="btns">
        <a class="btn p sm" href="${esc(it.url)}" target="_blank" rel="noopener">입주자모집공고</a>
        <button class="star ${isSaved('ch', it.id) ? 'on' : ''}" data-save="ch" data-id="${esc(it.id)}" title="저장">★</button>
      </div>
    </div>
  </div>`;
}

function supplyHTML() {
  const sm = summary();
  const list = sm.chs;
  const up = list.filter((it) => it.winner >= TODAY).sort((a, b) => a.rcept.localeCompare(b.rcept));
  const moveIn = list.filter((it) => it.mvn && it.mvn >= NOW_YM && it.winner < TODAY).sort((a, b) => a.mvn.localeCompare(b.mvn));
  const past = list.filter((it) => it.winner < TODAY).sort((a, b) => b.date.localeCompare(a.date));
  const mvSum = moveIn.reduce((a, it) => a + (it.total || 0), 0);
  const head = `<div class="tools"><div class="seg"><span class="lbl">반경</span>${CH_RADII.map((r) => `<button data-chr="${r}" class="${r === settings.chRadius ? 'on' : ''}">${fmtR(r)}</button>`).join('')}</div></div>`;
  const sec = (t, sub, arr, empty) => `<div class="sec">${t}<small>${sub}</small></div>` + (arr.length ? arr.map((it) => chCard(it)).join('') : `<div class="meta" style="padding:4px 2px 8px">${empty}</div>`);
  return head
    + sec('📢 청약 예정·진행', `${up.length}건`, up, '반경 안에 접수 예정·진행 중인 청약이 없어요.')
    + sec('🏢 입주 예정 (공급 예정)', `${moveIn.length}개 단지 · ${fmtN(mvSum)}세대`, moveIn, '최근 3년 분양분 중 입주 예정 단지가 없어요.')
    + sec('📊 최근 3년 분양 결과', `${past.length}건`, past, '최근 3년 분양 단지가 없어요.')
    + '<div class="note">청약홈 입주자모집공고 기준 최근 3년 자료예요. 입주 예정은 분양을 마친 단지의 입주 예정월로 보여 줍니다. 평당 분양가는 전용면적 기준(주변 실거래 평당가와 같은 기준)이에요.</div>';
}

function bindBody() {
  const body = $('#shBody');
  body.onclick = (e) => {
    const t = e.target;
    if (t.closest('a')) return;
    const star = t.closest('[data-save]'); if (star) { toggleSave(star.dataset.save, star.dataset.id); star.classList.toggle('on', isSaved(star.dataset.save, star.dataset.id)); return; }
    const r = t.closest('[data-r]'); if (r) { settings.radius = +r.dataset.r; LS.set('settings', settings); drawCircle(); const p = sitePoint(S.sel); S.map.setLevel(levelFor(settings.radius)); S.map.setCenter(new kakao.maps.LatLng(p.lat - latShift(settings.radius), p.lng)); renderSheet(); drawLayer(); return; }
    const c = t.closest('[data-chr]'); if (c) { settings.chRadius = +c.dataset.chr; LS.set('settings', settings); renderSheet(); drawLayer(); return; }
    const so = t.closest('[data-sort]'); if (so) { S.sort = so.dataset.sort; renderSheetBody(); return; }
    const ours = t.closest('[data-site]'); if (ours) return selectSite(ours.dataset.site);
    if (t.closest('[data-act="fix"]')) return startFix();
    if (t.closest('[data-act="draw"]')) return startDraw();
    const it = t.closest('.item'); if (it) {
      const open = !it.classList.contains('open');
      $$('.item.open', body).forEach((x) => x.classList.remove('open'));
      it.classList.toggle('open', open);
      if (open) focusOn(it.dataset.cx ? S.an.cx.find((r) => cxId(r) === it.dataset.cx) : S.an.ch.find((x) => x.id === it.dataset.ch), it.dataset.cx || ('ch|' + it.dataset.ch));
    }
  };
}

// ---------- 지도 표식 ----------
function clearLayer() { S.layer.forEach((o) => o.setMap(null)); S.layer = []; S.layerEls = {}; }
function drawLayer() {
  clearLayer(); const an = S.an; if (!an || !S.map) return;
  const lvl = S.map.getLevel();
  for (const r of (an.cx || []).filter((x) => x.d <= settings.radius)) {
    const el = document.createElement('div'); el.className = 'mk-cx ' + ageCls(r.by);
    const v = r.py12 || r.py36;
    el.innerHTML = `${v ? fmtN(v) : '–'}${lvl <= 4 ? `<small>${esc(r.apt)}</small>` : ''}`;
    if (!r.py12) el.style.opacity = .6;
    el.onclick = (e) => { e.stopPropagation(); openItem('price', cxId(r)); };
    const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(r.lat, r.lng), content: el, yAnchor: .5, zIndex: 3 });
    ov.setMap(S.map); S.layer.push(ov); S.layerEls[cxId(r)] = el;
  }
  for (const it of (an.ch || []).filter((x) => x.d <= settings.chRadius)) {
    const el = document.createElement('div'); el.className = 'mk-ch' + (it.winner < TODAY ? ' done' : '');
    el.textContent = (it.winner >= TODAY ? '청약 ' : it.mvn >= NOW_YM ? '입주 ' + fmtYm(it.mvn) + ' ' : '') + (lvl <= 5 ? it.name.slice(0, 12) : '');
    el.onclick = (e) => { e.stopPropagation(); openItem('supply', 'ch|' + it.id); };
    const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(it.lat, it.lng), content: el, yAnchor: .5, zIndex: 4 });
    ov.setMap(S.map); S.layer.push(ov); S.layerEls['ch|' + it.id] = el;
  }
}
function focusOn(obj, key) {
  Object.values(S.layerEls || {}).forEach((el) => el.classList.remove('hl'));
  const el = S.layerEls?.[key]; if (el) el.classList.add('hl');
  if (obj && obj.lat) S.map.panTo(new kakao.maps.LatLng(obj.lat - (innerWidth >= 900 ? 0 : (S.map.getBounds().getNorthEast().getLat() - S.map.getBounds().getSouthWest().getLat()) * 0.22), obj.lng));
}
function openItem(tab, key) {
  S.sheetTab = tab; renderSheet(); setSheet('open');
  const sel = key.startsWith('ch|') ? `[data-ch="${CSS.escape(key.slice(3))}"]` : `[data-cx="${CSS.escape(key)}"]`;
  const it = $('#shBody ' + sel); if (it) { it.classList.add('open'); it.scrollIntoView({ block: 'start' }); }
  Object.values(S.layerEls || {}).forEach((el) => el.classList.remove('hl')); S.layerEls?.[key]?.classList.add('hl');
}

// ---------- 저장 ----------
function toggleSave(kind, id) {
  const i = S.saved.findIndex((x) => x.kind === kind && x.id === id);
  if (i >= 0) { S.saved.splice(i, 1); toast('저장에서 뺐어요'); }
  else {
    let rec;
    if (kind === 'cx') { const r = S.an.cx.find((x) => cxId(x) === id); rec = { kind, id, name: r.apt, sub: `${r.n} ${r.dong} · ${r.by || '-'}년`, val: r.py12 || r.py36, lat: r.lat, lng: r.lng, site: S.sel.name, at: TODAY }; }
    else { const it = S.an.ch.find((x) => x.id === id); rec = { kind, id, name: it.name, sub: `${it.addr}`, rcept: it.rcept, url: it.url, lat: it.lat, lng: it.lng, site: S.sel.name, at: TODAY }; }
    S.saved.unshift(rec); toast('⭐ 저장했어요');
  }
  LS.set('saved', S.saved);
}
function renderSaved() {
  const el = $('#savedList');
  if (!S.saved.length) { el.innerHTML = '<div class="empty">아직 저장한 곳이 없어요.<br>지도에서 단지나 청약을 열고 ★를 눌러 보세요.</div>'; return; }
  el.innerHTML = S.saved.map((x) => `<div class="card" style="cursor:default">
    <div class="row"><div class="grow">
      <span class="badge" style="--c:${x.kind === 'cx' ? 'var(--accent)' : 'var(--ch)'}">${x.kind === 'cx' ? '단지' : '청약'}</span><span class="meta">${esc(x.site)} 주변</span>
      <div style="font-weight:800;font-size:16px;margin:5px 0 2px">${esc(x.name)}</div>
      <div class="meta">${esc(x.sub)}${x.val ? ` · 평당 ${fmtN(x.val)}만` : ''}${x.rcept ? ` · 접수 ${fmtDate(x.rcept)}` : ''}</div>
    </div><button class="star on" data-del="${esc(x.kind + '|' + x.id)}" title="저장 해제">★</button></div>
    <div class="btns" style="margin-top:10px">
      ${x.url ? `<a class="btn p sm" href="${esc(x.url)}" target="_blank" rel="noopener">모집공고</a>` : ''}
    </div></div>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const [kind, ...rest] = b.dataset.del.split('|'); const id = rest.join('|');
    S.saved = S.saved.filter((x) => !(x.kind === kind && x.id === id)); LS.set('saved', S.saved); renderSaved();
  };
}

// ---------- 청약 일정(전국) ----------
const SIDO = ['서울', '경기', '인천', '부산', '대구', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남광주', '경북', '경남', '제주'];
async function renderCal() {
  const fl = $('#calFilter');
  const siteSido = [...new Set(S.sites.map((s) => s.sido))];
  const opts = ['전체', ...SIDO];
  fl.innerHTML = opts.map((k) => `<button class="${k === S.calFilter ? 'on' : ''}" data-k="${k}">${k}${siteSido.includes(k) ? ' •' : ''}</button>`).join('');
  fl.onclick = (e) => { const b = e.target.closest('button'); if (b) { S.calFilter = b.dataset.k; renderCal(); } };
  const want = S.calFilter === '전체' ? SIDO : [S.calFilter];
  const all = (await Promise.all(want.map((sd) => loadCh(sd).then((it) => it.map((x) => Object.assign({ sd }, x)))))).flat();
  const list = all.filter((it) => it.winner >= TODAY).sort((a, b) => a.rcept.localeCompare(b.rcept));
  const el = $('#calList');
  if (!list.length) { el.innerHTML = '<div class="empty">접수 예정·진행 중인 청약이 없어요.</div>'; return; }
  const groups = {};
  for (const it of list) (groups[it.rcept.slice(0, 7)] ||= []).push(it);
  el.innerHTML = Object.entries(groups).map(([m, arr]) => `<div class="sec">${m.slice(0, 4)}년 ${+m.slice(5)}월 접수<small>${arr.length}건</small></div>
    <div class="card" style="cursor:default;padding:4px 12px">${arr.map((it) => {
      const near = nearestSite(it);
      return chCard(Object.assign({}, it, { d: null }), false).replace('<div class="nm">', `<div class="meta">${esc(it.sd)} ${esc(it.sgg || '')}${near ? ` · <b style="color:var(--accent)">${esc(near)}</b>` : ''}</div><div class="nm">`);
    }).join('')}</div>`).join('');
  el.onclick = (e) => {
    if (e.target.closest('a')) return;
    const star = e.target.closest('[data-save]');
    if (star) { const it = list.find((x) => x.id === star.dataset.id); toggleSaveCal(it); star.classList.toggle('on', isSaved('ch', it.id)); return; }
    const it = e.target.closest('.item'); if (it) it.classList.toggle('open');
  };
}
function nearestSite(it) { // 같은 시군구에 있는 당사 사업장
  const a = it.addr || '';
  const s = S.sites.find((s) => a.includes(s.sgg.split(' ')[0]) && (a.includes(s.dong) || s.sgg.split(' ').length === 1));
  return s ? s.name + ' 인근' : '';
}
function toggleSaveCal(it) {
  const i = S.saved.findIndex((x) => x.kind === 'ch' && x.id === it.id);
  if (i >= 0) S.saved.splice(i, 1);
  else S.saved.unshift({ kind: 'ch', id: it.id, name: it.name, sub: it.addr, rcept: it.rcept, url: it.url, site: it.sd, at: TODAY });
  LS.set('saved', S.saved); toast(i >= 0 ? '저장에서 뺐어요' : '⭐ 저장했어요');
}

// ---------- 위치 맞추기 ----------
function startFix() { S.fix = true; $('#fixBar').classList.add('on'); setSheet('show'); toast('지도에서 사업장 가운데를 눌러 주세요'); }
function moveSite(ll) {
  const s = S.sel; if (!s) return;
  S.sitePos[s.id] = [+ll.getLat().toFixed(6), +ll.getLng().toFixed(6)]; LS.set('sitePos', S.sitePos);
  placeSite(s); drawCircle();
}
function endFix() {
  S.fix = false; $('#fixBar').classList.remove('on');
  const s = S.sel; if (!s) return;
  const v = S.sitePos[s.id];
  if (v) {
    const txt = `"lat": ${v[0]}, "lng": ${v[1]}`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    openModal(`<h3>📌 위치를 옮겼어요</h3>
      <p class="meta" style="line-height:1.6">이 기기에서는 바로 반영돼요. 모든 사람에게 반영하려면 저장소의 <b>site/data/sites.json</b>에서 <b>${esc(s.name)}</b>의 값을 아래로 바꿔 주세요(클립보드에 복사됨). Claude에게 “위치 반영해줘”라고 붙여 넣어도 돼요.</p>
      <input class="input num" readonly value='${esc(txt)}' onclick="this.select()">
      <div class="btns" style="margin-top:14px"><button class="btn" id="resetPos">원래 위치로</button><button class="btn p" onclick="closeModal()">확인</button></div>`);
    $('#resetPos').onclick = () => { delete S.sitePos[s.id]; LS.set('sitePos', S.sitePos); placeSite(s); closeModal(); selectSite(s.id); };
  }
  selectSite(s.id);
}

// ---------- 구역 경계 ----------
const areaPath = (s) => S.siteArea[s.id] || s.area || null; // [[위도, 경도], ...]
function polyArea(path) { // ㎡ (지구 곡률 무시한 평면 근사 — 구역 크기에선 오차 미미)
  if (!path || path.length < 3) return 0;
  const r = Math.PI / 180, lat0 = path[0][0] * r, R = 6371000;
  const xy = path.map(([la, lo]) => [lo * r * R * Math.cos(lat0), la * r * R]);
  let a = 0; for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
const areaOf = (s) => polyArea(areaPath(s));
const fmtArea = (m2) => `${fmtN(m2)}㎡ (${fmtN(m2 / 3.3058)}평)`;
function drawAreas() {
  Object.values(S.areaOv).forEach((o) => o.setMap(null)); S.areaOv = {};
  for (const s of S.sites) {
    const path = areaPath(s); if (!path || path.length < 3) continue;
    const c = getComputedStyle(document.documentElement).getPropertyValue(/소규모|가로|모아/.test(s.type) ? '--t-small' : /재건축/.test(s.type) ? '--t-recon' : '--t-redev').trim() || '#1d5fd1';
    const sel = S.sel && S.sel.id === s.id;
    const pg = new kakao.maps.Polygon({ path: path.map(([a, b]) => new kakao.maps.LatLng(a, b)), strokeWeight: sel ? 3 : 2, strokeColor: c, strokeOpacity: .95, strokeStyle: 'solid', fillColor: c, fillOpacity: sel ? .22 : .12, zIndex: 2 });
    pg.setMap(S.map);
    kakao.maps.event.addListener(pg, 'click', () => { if (!S.draw && !S.fix) selectSite(s.id); });
    S.areaOv[s.id] = pg;
  }
}
function setCadastral(on) {
  S.cadastral = on; if (!S.map) return;
  if (on) S.map.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT); else S.map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
  $('#btnCad').classList.toggle('on', on);
  toast(on ? '지적편집도를 켰어요 (필지 경계 표시)' : '지적편집도를 껐어요');
}
function startDraw() {
  if (!S.sel) return;
  S.draw = { path: [], line: null, poly: null, dots: [] };
  if (S.areaOv[S.sel.id]) S.areaOv[S.sel.id].setMap(null);
  if (S.circle) S.circle.setMap(null);
  clearLayer(); setSheet('hide'); $('#drawBar').classList.add('on');
  if (!S.cadastral) setCadastral(true);
  const p = sitePoint(S.sel); S.map.setLevel(3); S.map.setCenter(new kakao.maps.LatLng(p.lat, p.lng));
  updateDrawBar();
}
function addVertex(ll) { S.draw.path.push([+ll.getLat().toFixed(6), +ll.getLng().toFixed(6)]); renderDraft(); }
function renderDraft() {
  const d = S.draw; [d.line, d.poly, ...d.dots].forEach((o) => o && o.setMap(null)); d.dots = [];
  const lls = d.path.map(([a, b]) => new kakao.maps.LatLng(a, b));
  if (lls.length >= 3) { d.poly = new kakao.maps.Polygon({ path: lls, strokeWeight: 3, strokeColor: '#e8590c', strokeOpacity: 1, fillColor: '#e8590c', fillOpacity: .15, zIndex: 8 }); d.poly.setMap(S.map); d.line = null; }
  else if (lls.length === 2) { d.line = new kakao.maps.Polyline({ path: lls, strokeWeight: 3, strokeColor: '#e8590c', zIndex: 8 }); d.line.setMap(S.map); d.poly = null; }
  lls.forEach((ll, i) => { const el = document.createElement('div'); el.style.cssText = `width:${i ? 10 : 14}px;height:${i ? 10 : 14}px;border-radius:50%;background:#fff;border:3px solid #e8590c;box-sizing:border-box`; const o = new kakao.maps.CustomOverlay({ position: ll, content: el, zIndex: 9 }); o.setMap(S.map); d.dots.push(o); });
  updateDrawBar();
}
function updateDrawBar() {
  const n = S.draw.path.length;
  $('#drawInfo').textContent = n < 3 ? `경계를 따라 지도를 눌러 꼭짓점을 찍으세요 (${n}개)` : `꼭짓점 ${n}개 · ${fmtArea(polyArea(S.draw.path))}`;
}
function drawAct(a) {
  const d = S.draw; if (!d) return;
  if (a === 'undo') { d.path.pop(); renderDraft(); return; }
  if (a === 'clear') { d.path = []; renderDraft(); return; }
  if (a === 'cad') { setCadastral(!S.cadastral); return; }
  const s = S.sel;
  [d.line, d.poly, ...d.dots].forEach((o) => o && o.setMap(null));
  S.draw = null; $('#drawBar').classList.remove('on');
  if (a === 'done' && d.path.length >= 3) {
    S.siteArea[s.id] = d.path; LS.set('siteArea', S.siteArea);
    const txt = `"area": ${JSON.stringify(d.path)}`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    openModal(`<h3>✏️ ${esc(s.name)} 구역을 저장했어요</h3>
      <p class="meta" style="line-height:1.6">면적 <b>${fmtArea(polyArea(d.path))}</b> · 꼭짓점 ${d.path.length}개<br>이 기기에서는 바로 보여요. 모두에게 보이게 하려면 아래 값(클립보드에 복사됨)을 Claude에게 붙여 넣어 주세요.</p>
      <textarea class="input num" readonly rows="4" onclick="this.select()" style="font-size:11px">${esc(txt)}</textarea>
      <div class="btns" style="margin-top:14px">${s.area ? '' : ''}<button class="btn" id="delArea">이 기기 구역 지우기</button><button class="btn p" onclick="closeModal()">확인</button></div>`);
    $('#delArea').onclick = () => { delete S.siteArea[s.id]; LS.set('siteArea', S.siteArea); closeModal(); drawAreas(); selectSite(s.id); };
  } else if (a === 'done') toast('꼭짓점을 3개 이상 찍어 주세요');
  drawAreas(); selectSite(s.id);
}

// ---------- 내 위치 ----------
function locateMe() {
  if (!navigator.geolocation) return toast('이 기기에서는 위치를 쓸 수 없어요');
  navigator.geolocation.getCurrentPosition((pos) => {
    S.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (S.map) {
      const ll = new kakao.maps.LatLng(S.me.lat, S.me.lng);
      if (!S.meMark) { const el = document.createElement('div'); el.className = 'mk-me'; S.meMark = new kakao.maps.CustomOverlay({ position: ll, content: el, zIndex: 30 }); S.meMark.setMap(S.map); }
      else S.meMark.setPosition(ll);
      S.map.panTo(ll);
    }
    renderSites();
    const near = S.sites.map((s) => [s, dist(S.me, sitePoint(s))]).sort((a, b) => a[1] - b[1])[0];
    if (near) toast(`가장 가까운 사업장: ${near[0].name} (${fmtDist(near[1])})`);
  }, () => toast('위치 권한을 허용해 주세요'), { enableHighAccuracy: true, timeout: 10000 });
}

// ---------- 설정 ----------
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
function openSettings() {
  const m = S.meta;
  openModal(`<h3>⚙️ 설정</h3>
    <div class="field"><label>기본 시세 반경</label><div class="seg" id="setR">${RADII.map((r) => `<button data-r="${r}" class="${r === settings.radius ? 'on' : ''}">${fmtR(r)}</button>`).join('')}</div></div>
    <div class="field"><label>기본 청약·공급 반경</label><div class="seg" id="setC">${CH_RADII.map((r) => `<button data-r="${r}" class="${r === settings.chRadius ? 'on' : ''}">${fmtR(r)}</button>`).join('')}</div></div>
    <div class="field"><label>카카오 JavaScript 키 (선택)</label><input class="input" id="setKey" value="${esc(settings.kakaoKey)}" placeholder="비워두면 앱 기본 키 사용" autocomplete="off"></div>
    <div class="field"><label>찾아 둔 위치</label><div class="meta" style="margin-bottom:8px">단지·청약 위치 ${Object.keys(Geo.db).length.toLocaleString()}곳을 이 기기에 저장해 두었어요. 위치가 이상하면 지우고 다시 찾게 할 수 있어요.</div><button class="btn sm" id="setClear">찾아 둔 위치 지우기</button></div>
    <div class="note">자료: 국토교통부 아파트 매매 실거래가(${m ? fmtYm(m.tradeFrom) + '~' + fmtYm(m.tradeTo) : '-'}), 한국부동산원 청약홈 분양정보·경쟁률 — 분양시장 레이더가 매일 07:17 수집, 이 앱은 매일 08:07 갱신${m ? ` (마지막 ${esc(m.builtAt)})` : ''}. 평당가는 전용면적 기준이에요.</div>
    <div class="btns"><button class="btn p" id="setSave" style="flex:1;justify-content:center">저장</button></div>`);
  const pick = (id, key) => { $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; settings[key] = +b.dataset.r; $$(id + ' button').forEach((x) => x.classList.toggle('on', x === b)); }; };
  pick('#setR', 'radius'); pick('#setC', 'chRadius');
  $('#setClear').onclick = () => { Geo.db = {}; LS.set('geo', {}); toast('찾아 둔 위치를 지웠어요'); closeModal(); if (S.sel) selectSite(S.sel.id); };
  $('#setSave').onclick = () => {
    const nk = $('#setKey').value.trim(); const changed = nk !== settings.kakaoKey; settings.kakaoKey = nk;
    LS.set('settings', settings); closeModal();
    if (changed) location.reload(); else if (S.sel) selectSite(S.sel.id);
  };
}

addEventListener('resize', () => { if (S.sel) setSheet($('#sheet').classList.contains('full') ? 'full' : $('#sheet').classList.contains('open') ? 'open' : 'show'); });
init();
