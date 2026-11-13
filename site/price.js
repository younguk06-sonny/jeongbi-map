/* 정비맵 — 가격 레이어 (실거래가 · 매매가 · 전세가)
   지도 상단 탭 하나를 고르면, 화면 안 아파트 단지마다 가격 배지를 띄움. 누르면 단지 세부내용.
   - 실거래가: 가장 최근 거래가 있었던 달의 거래가(중위)와 그 달
   - 매매가: 최근 12개월 평당가(전용 3.3㎡, 거래 가중)
   - 전세가: 최근 12개월 전세 보증금(중위)과 전세가율 (국토부 전월세 실거래가) */
'use strict';

const PRICE_MODES = {
  rt: { name: '실거래가', ico: '💰', c: '#1d5fd1', desc: '단지별 가장 최근 거래가 있었던 달의 거래가(중위)예요.' },
  mm: { name: '매매가', ico: '🏷️', c: '#0b7285', desc: '단지별 최근 12개월 평당 매매가(전용 3.3㎡ 기준, 거래 건수 가중)예요.' },
  js: { name: '전세가', ico: '🔑', c: '#2b8a3e', desc: '단지별 최근 12개월 전세 보증금(중위)과 전세가율(전세 평당 ÷ 매매 평당)이에요.' },
};
const PR = { mode: LS.get('priceMode', null), age: LS.get('priceAge', 'all'), amt: LS.get('priceAmt', [0, 50]), marks: {}, shown: new Set(), busy: false, again: false, selKey: null };
const PRICE_MAX_LEVEL = 5; // 동 단위까지
const AGES = [['all', '전체'], ['n10', '10년 이내'], ['m', '10~20년'], ['o20', '20~30년'], ['o30', '30년 이상']];
const AMT_MAX = 50, AMT_STEP = 0.5; // 억 단위, 50 = 상한 없음
const AMT_BASIS = { rt: '최근 거래가', mm: '12개월 대표 거래가', js: '전세 보증금' };

function cxObj(f, r) {
  return { code: f.code, sgg: f.n, sd: f.sd, apt: r[0], dong: r[1], by: r[2], n12: r[3], py12: r[4], amt12: r[5], n36: r[6], py36: r[7], last: r[8], q: r[9], deals: r[10],
    lastAmt: r[12], lastPy: r[13], lastN: r[14], rent: r[15] || null, quarters: f.quarters };
}
const cxKeyOf = (c) => `${c.code}|${c.dong}|${c.apt}`;
function ageOk(c) {
  if (PR.age === 'all') return true;
  if (!c.by) return false;
  const a = THIS_YEAR - c.by;
  if (PR.age === 'n10') return a <= 10;
  if (PR.age === 'm') return a > 10 && a <= 20;
  if (PR.age === 'o20') return a > 20 && a < 30;
  return a >= 30;
}
// 금액 구간 (모드마다 기준 금액이 다름)
function amtOf(c, m) { return m === 'rt' ? c.lastAmt : m === 'js' ? c.rent?.[1] : (c.amt12 || c.lastAmt); }
function amtOk(c, m) {
  const [lo, hi] = PR.amt; if (lo <= 0 && hi >= AMT_MAX) return true;
  const v = amtOf(c, m); if (v == null) return false;
  const eok = v / 10000;
  return eok >= lo && (hi >= AMT_MAX || eok <= hi);
}
const amtTxt = (v) => (v >= AMT_MAX ? `${AMT_MAX}억+` : `${v % 1 ? v.toFixed(1) : v}억`);
function hasMode(c, m) {
  if (m === 'rt') return c.lastAmt != null;
  if (m === 'mm') return c.py12 != null || c.py36 != null;
  return !!(c.rent && c.rent[1]);
}

async function viewCodes() {
  const b = S.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
  const pts = [[(sw.getLat() + ne.getLat()) / 2, (sw.getLng() + ne.getLng()) / 2], [sw.getLat(), sw.getLng()], [ne.getLat(), ne.getLng()], [sw.getLat(), ne.getLng()], [ne.getLat(), sw.getLng()]];
  const codes = new Set();
  await Promise.all(pts.map(async ([lat, lng]) => { for (const r of await Kakao.regionCodes({ lat, lng })) if (r.region_type === 'B' && S.meta?.codes[r.code.slice(0, 5)]) codes.add(r.code.slice(0, 5)); }));
  return [...codes];
}

// 단지 위치 (주변 시세 분석과 같은 저장 키를 써서 한 번 찾은 곳은 다시 안 찾음)
async function locateDong(f, dong) {
  const k = 'dong|' + f.code + '|' + dong;
  if (Geo.get(k) === undefined) {
    let res = await Kakao.addressSearch(`${f.n} ${dong}`);
    if (!res.length) res = await Kakao.keyword(`${f.n} ${dong}`);
    Geo.put(k, res.length ? [+res[0].y, +res[0].x] : 0);
  }
  return pt(Geo.get(k));
}
async function locateCx(c, center) {
  const k = 'cx|' + c.code + '|' + c.dong + '|' + c.apt;
  if (Geo.get(k) === undefined) {
    const name = c.apt.replace(/\(.*?\)/g, ' ').trim();
    let res = await Kakao.keyword(`${c.dong} ${name}`, { location: center, radius: 20000 });
    let hit = res.find((x) => /아파트|주거/.test(x.category_name) && (x.address_name || '').includes(c.dong)) || res.find((x) => (x.address_name || '').includes(c.dong));
    if (!hit && name !== c.apt) { res = await Kakao.keyword(`${c.dong} ${c.apt}`, { location: center, radius: 20000 }); hit = res.find((x) => (x.address_name || '').includes(c.dong)); }
    Geo.put(k, hit ? [+hit.y, +hit.x] : 0);
  }
  const g = pt(Geo.get(k)); if (g) { c.lat = g.lat; c.lng = g.lng; }
  return g;
}

async function pricesRefresh() {
  if (!S.map) return;
  if (PR.busy) { PR.again = true; return; }
  PR.busy = true;
  try {
    const lvl = S.map.getLevel(), m = PR.mode;
    const hint = $('#phint');
    if (!m || lvl > PRICE_MAX_LEVEL) {
      for (const k of PR.shown) PR.marks[k]?.ov.setMap(null); PR.shown = new Set();
      if (hint) hint.classList.toggle('on', !!m && lvl > PRICE_MAX_LEVEL);
      return;
    }
    if (hint) hint.classList.remove('on');
    const b = S.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
    const pad = 0.012, inView = (p, k = 0) => p.lat > sw.getLat() - k && p.lat < ne.getLat() + k && p.lng > sw.getLng() - k && p.lng < ne.getLng() + k;
    const files = (await Promise.all((await viewCodes()).map(loadNear))).filter(Boolean);
    // 1) 동 위치로 거르기
    const cand = [];
    for (const f of files) {
      const dongs = [...new Set(f.cx.map((r) => r[1]))];
      const pos = {};
      await pool(dongs, 5, async (d) => { pos[d] = await locateDong(f, d); });
      for (const r of f.cx) { const p = pos[r[1]]; if (p && inView(p, pad)) { const c = cxObj(f, r); if (ageOk(c) && hasMode(c, m) && amtOk(c, m)) cand.push(c); } }
    }
    cand.sort((a, b) => (b.n12 || 0) - (a.n12 || 0));
    const list = cand.slice(0, 220);
    // 2) 단지 위치 찾기 (먼저 찾은 것부터 바로 표시)
    const center = S.map.getCenter(), keep = new Set();
    let drawn = 0;
    await pool(list, 6, async (c) => {
      if (PR.mode !== m) return;
      const g = await locateCx(c, center);
      if (g && inView(g)) { keep.add(cxKeyOf(c)); drawPriceMark(c, m, lvl); if (++drawn % 20 === 0) setPriceCnt(drawn); }
    });
    Geo.flush();
    if (PR.mode !== m) return;
    for (const k of PR.shown) if (!keep.has(k)) PR.marks[k]?.ov.setMap(null);
    PR.shown = keep;
    setPriceCnt(keep.size || '');
  } catch (e) { console.warn(e); }
  finally { PR.busy = false; if (PR.again) { PR.again = false; pricesRefresh(); } }
}

function priceLabel(c, m) {
  if (m === 'rt') return { v: fmtEok(c.lastAmt), s: ymLabel(c.last) };
  if (m === 'mm') return { v: fmtN(c.py12 || c.py36) + '만', s: c.py12 ? '평당' : '평당·36개월' };
  const ratio = c.rent && (c.py12 || c.py36) ? Math.round(c.rent[2] / (c.py12 || c.py36) * 100) : null;
  return { v: fmtEok(c.rent[1]), s: ratio ? `전세가율 ${ratio}%` : '전세' };
}
function drawPriceMark(c, m, lvl) {
  const k = cxKeyOf(c), named = lvl <= 3;
  const sig = m + (named ? 'n' : '') + (PR.selKey === k ? 's' : '');
  const old = PR.marks[k];
  if (old && old.sig === sig) { old.ov.setMap(S.map); return; }
  if (old) old.ov.setMap(null);
  const L = priceLabel(c, m), el = document.createElement('div');
  el.className = 'mk-pr ' + ageCls(c.by) + (PR.selKey === k ? ' sel' : '') + (m === 'mm' && !c.py12 ? ' faint' : '');
  el.style.setProperty('--c', PRICE_MODES[m].c);
  el.innerHTML = `<b>${esc(L.v)}</b><small>${named ? esc(c.apt.length > 10 ? c.apt.slice(0, 10) + '…' : c.apt) : esc(L.s)}</small>`;
  el.title = `${c.apt} · ${L.s}`;
  el.onclick = (e) => { e.stopPropagation(); selectCx(c); };
  const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(c.lat, c.lng), content: el, yAnchor: 1.1, zIndex: 5 });
  ov.setMap(S.map);
  PR.marks[k] = { ov, sig };
}

// ---------- 탭 ----------
function priceTab(m) {
  const turnOn = PR.mode !== m;
  PR.mode = turnOn ? m : null; LS.set('priceMode', PR.mode);
  for (const k of PR.shown) PR.marks[k]?.ov.setMap(null); PR.shown = new Set(); PR.marks = {};
  priceTabsLabel();
  if (turnOn) { if ($('#fpanel').dataset.p !== 'price') openTab('price'); renderPricePanel(); }
  else if ($('#fpanel').dataset.p === 'price') openTab(null);
  if (S.an) drawLayer(); // 주변 시세 배지와 겹치지 않게
  pricesRefresh();
}
function setPriceCnt(v) { const e = PR.mode && $(`#ftabs [data-p="${PR.mode}"] .pcnt`); if (e) e.textContent = v; }
function priceTabsLabel() {
  for (const k of Object.keys(PRICE_MODES)) $(`#ftabs [data-p="${k}"]`)?.classList.toggle('on', PR.mode === k);
  $$('#ftabs .pcnt').forEach((e) => { if (e.parentElement.dataset.p !== PR.mode) e.textContent = ''; });
}
function renderPricePanel() {
  const el = $('#pricePanel'); if (!el) return;
  const m = PR.mode && PRICE_MODES[PR.mode];
  if (!m) { el.innerHTML = '<div class="meta">위 탭에서 실거래가·매매가·전세가 중 하나를 고르세요.</div>'; return; }
  const noRent = PR.mode === 'js' && !S.meta?.rentTo;
  el.innerHTML = `<div class="zf-row"><b class="pp-t" style="--c:${m.c}">${m.ico} ${m.name}</b><span class="meta grow">${esc(m.desc)}</span></div>
    <div class="zf-row" style="margin-top:8px"><span class="lbl">연식</span>${AGES.map(([k, l]) => `<button class="pchip ${PR.age === k ? 'on' : ''}" data-age="${k}">${l}</button>`).join('')}</div>
    <div class="amt-box">
      <div class="zf-row"><span class="lbl">금액</span><b class="amt-val" id="amtVal">${amtTxt(PR.amt[0])} ~ ${amtTxt(PR.amt[1])}</b><span class="meta grow">${AMT_BASIS[PR.mode]} 기준</span>${PR.amt[0] > 0 || PR.amt[1] < AMT_MAX ? '<button class="pchip" data-amtreset="1">초기화</button>' : ''}</div>
      <div class="range2" style="--lo:${PR.amt[0] / AMT_MAX * 100}%;--hi:${PR.amt[1] / AMT_MAX * 100}%;--c:${m.c}">
        <div class="r2-track"><i></i></div>
        <input type="range" id="amtLo" min="0" max="${AMT_MAX}" step="${AMT_STEP}" value="${PR.amt[0]}" aria-label="최소 금액">
        <input type="range" id="amtHi" min="0" max="${AMT_MAX}" step="${AMT_STEP}" value="${PR.amt[1]}" aria-label="최대 금액">
      </div>
      <div class="r2-scale"><span>0억</span><span>10억</span><span>20억</span><span>30억</span><span>40억</span><span>50억+</span></div>
    </div>
    ${noRent ? '<div class="note" style="margin:8px 0 0">전세 자료를 처음 모으는 중이에요(국토부 전월세 실거래가). 수집이 끝나면 배지가 표시돼요.</div>' : ''}
    <div class="meta" style="margin-top:6px">동 단위까지 당기면 보여요 · 많이 거래된 단지부터 최대 220곳 · 배지를 누르면 단지 세부내용</div>`;
  const redraw = () => { for (const k of PR.shown) PR.marks[k]?.ov.setMap(null); PR.shown = new Set(); pricesRefresh(); };
  el.onclick = (e) => {
    if (e.target.closest('[data-amtreset]')) { PR.amt = [0, AMT_MAX]; LS.set('priceAmt', PR.amt); renderPricePanel(); return redraw(); }
    const b = e.target.closest('[data-age]'); if (!b) return;
    PR.age = b.dataset.age; LS.set('priceAge', PR.age);
    renderPricePanel(); redraw();
  };
  // 두 손잡이: 끄는 동안 숫자만 바꾸고, 놓으면 지도 갱신
  const lo = $('#amtLo'), hi = $('#amtHi'), box = el.querySelector('.range2');
  const sync = (who) => {
    let a = +lo.value, b = +hi.value;
    if (a > b - AMT_STEP) { if (who === 'lo') a = Math.max(0, b - AMT_STEP); else b = Math.min(AMT_MAX, a + AMT_STEP); lo.value = a; hi.value = b; }
    PR.amt = [a, b];
    box.style.setProperty('--lo', a / AMT_MAX * 100 + '%'); box.style.setProperty('--hi', b / AMT_MAX * 100 + '%');
    $('#amtVal').textContent = `${amtTxt(a)} ~ ${amtTxt(b)}`;
  };
  lo.oninput = () => sync('lo'); hi.oninput = () => sync('hi');
  const commit = () => { LS.set('priceAmt', PR.amt); renderPricePanel(); redraw(); };
  lo.onchange = commit; hi.onchange = commit;
}
function pricesInit() {
  kakao.maps.event.addListener(S.map, 'idle', pricesRefresh);
  priceTabsLabel(); pricesRefresh();
}

// ---------- 단지 세부내용 ----------
function selectCx(c) {
  const prev = PR.selKey; PR.selKey = cxKeyOf(c);
  selectSite({ id: 'c:' + PR.selKey, cx: c, name: c.apt, type: '아파트', stage: c.by ? `${c.by}년 준공` : '', lat: c.lat, lng: c.lng, sido: c.sd, sgg: c.sgg, dong: c.dong, households: null });
  if (prev !== PR.selKey) pricesRefresh();
}
function clearCxSel() { if (PR.selKey) { PR.selKey = null; pricesRefresh(); } }

function cxInfoHTML(s, an) {
  const c = s.cx, r = c.rent, base = c.py12 || c.py36;
  const ratio = r && base ? Math.round(r[2] / base * 100) : null;
  const deals = (c.deals || []).map((d) => `<tr><td>${d[0].slice(2, 4)}.${d[0].slice(4, 6)}.${d[0].slice(6, 8)}</td><td>전용 ${d[1]}㎡</td><td>${d[2] ?? '-'}층</td><td>${fmtEok(d[3])}</td></tr>`).join('');
  const inCmp = ST.cmp.some((x) => cmpKey(x) === cxKeyOf(c));
  return `
    <div class="pr-grid">
      <div class="pr-box" style="--c:${PRICE_MODES.rt.c}"><small>실거래가 · ${ymLabel(c.last)}</small><b class="num">${fmtEok(c.lastAmt)}</b><span>${c.lastN ? `그 달 ${c.lastN}건 중위` : ''}</span></div>
      <div class="pr-box" style="--c:${PRICE_MODES.mm.c}"><small>매매 평당가 · 12개월</small><b class="num">${c.py12 ? fmtN(c.py12) + '만' : '–'}</b><span>${c.n12 ? `${c.n12}건 · 36개월 ${fmtN(c.py36)}만` : `36개월 ${fmtN(c.py36)}만`}</span></div>
      <div class="pr-box" style="--c:${PRICE_MODES.js.c}"><small>전세가 · 12개월</small><b class="num">${r ? fmtEok(r[1]) : '–'}</b><span>${r ? `전세 ${r[0]}건${r[3] ? ` · 월세 ${r[3]}건` : ''}` : S.meta?.rentTo ? '전세 거래 없음' : '자료 수집 중'}</span></div>
      <div class="pr-box" style="--c:#868e96"><small>전세가율</small><b class="num">${ratio ? ratio + '%' : '–'}</b><span>${ratio ? `전세 평당 ${fmtN(r[2])}만` : '전세 ÷ 매매 (평당)'}</span></div>
    </div>
    <dl class="dl">
      <dt>소재지</dt><dd>${esc(an.addr || `${c.sd} ${c.sgg} ${c.dong}`)}</dd>
      <dt>준공</dt><dd>${c.by ? `${c.by}년 (${THIS_YEAR - c.by}년차)` : '–'}</dd>
      <dt>12개월 대표 거래가</dt><dd>${fmtEok(c.amt12)}</dd>
    </dl>
    ${typeof chart === 'function' ? `<div class="sec">분기별 평당가<small>만원/전용 3.3㎡</small></div>${chart({ labels: c.quarters, series: [{ name: c.apt, vals: c.q, color: PRICE_MODES.mm.c }], unit: '만', mark: true, h: 130 })}` : ''}
    ${deals ? `<div class="sec">최근 거래</div><table class="deals num">${deals}</table>` : ''}
    <div class="btns">
      <button class="btn sm cmpadd ${inCmp ? 'on' : ''}" data-cmpadd='${esc(JSON.stringify({ code: c.code, dong: c.dong, apt: c.apt }))}'>${inCmp ? '✓ 비교 담김' : '＋ 비교 담기'}</button>
      <a class="btn sm" href="${Links.naverLand(c.sgg + ' ' + c.apt)}" target="_blank" rel="noopener">네이버부동산</a>
    </div>
    <div class="note">국토교통부 아파트 매매·전월세 실거래가 기준. 실거래가는 마지막 거래 달의 중위값이라 평형 구성에 따라 달라질 수 있어요. 평당가는 전용면적 기준이에요.</div>`;
}
