/* 정비맵 — 분양 레이어 (아파트 · 오피스텔 · 상가)
   자료: data/cheongyak/<시도>.json (청약홈 APT), data/officetel/<시도>.json (청약홈 오피스텔·도시형·생활숙박·민간임대)
   지도에 '단지명 · 세대수' 표시, 누르면 분양 세부내용 */
'use strict';

const SALE_TYPES = [
  ['apt', '아파트', '#e8590c'],
  ['ofc', '오피스텔·도시형', '#7048e8'],
  ['shop', '상가', '#0b7285'],
];
const SALE_PERIODS = [['up', '예정·진행'], ['y1', '최근 1년'], ['y3', '최근 3년']];
const SL = {
  visible: LS.get('saleOn', true), on: Object.assign({ apt: 1, ofc: 1, shop: 0 }, LS.get('saleTypes', {})), period: LS.get('salePeriod', 'y1'),
  ofc: {}, marks: {}, shown: new Set(), busy: false, again: false, selId: null, regionKey: '',
};
const SALE_MIN_LEVEL = 7;
const saleColor = (t) => (SALE_TYPES.find((x) => x[0] === t) || SALE_TYPES[0])[2];

async function loadOfc(sido) {
  if (!SL.ofc[sido]) SL.ofc[sido] = getJSON(`data/officetel/${encodeURIComponent(sido)}.json`).then((d) => d.items || []).catch(() => []);
  return SL.ofc[sido];
}
function saleStatus(it) {
  if (it.rcept && it.rcept > TODAY) return { k: 'soon', t: '접수 예정', d: Math.ceil((new Date(it.rcept) - new Date(TODAY)) / 864e5) };
  if (it.winner && it.winner >= TODAY) return { k: 'now', t: '청약 진행' };
  if (it.mvn && it.mvn >= NOW_YM) return { k: 'done', t: '분양 완료' };
  return { k: 'old', t: '입주 완료' };
}
function salePeriodOk(it) {
  const st = saleStatus(it);
  if (SL.period === 'up') return st.k === 'soon' || st.k === 'now';
  const days = SL.period === 'y1' ? 365 : 365 * 3;
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return st.k === 'soon' || st.k === 'now' || (it.date || '') >= from;
}
const saleKey = (it) => (it.__t || 'apt') + ':' + it.id;

// ---------- 화면 범위의 분양 단지 ----------
async function visibleSggs() {
  const b = S.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
  const pts = [[(sw.getLat() + ne.getLat()) / 2, (sw.getLng() + ne.getLng()) / 2], [sw.getLat(), sw.getLng()], [ne.getLat(), ne.getLng()], [sw.getLat(), ne.getLng()], [ne.getLat(), sw.getLng()]];
  const out = new Map();
  await Promise.all(pts.map(async ([lat, lng]) => {
    for (const r of await Kakao.regionCodes({ lat, lng })) {
      if (r.region_type !== 'B') continue;
      const mc = S.meta?.codes[r.code.slice(0, 5)];
      if (mc) out.set(r.code.slice(0, 5), mc);
    }
  }));
  return [...out.values()];
}
function inSgg(it, mc) {
  const city = mc.n.split(' ')[0], gu = mc.n.split(' ')[1];
  const a = (it.addr || '') + ' ' + (it.sgg || '');
  return a.includes(city) && (!gu || a.includes(gu) || (it.sgg || '') === city);
}
async function geocodeSale(it, center) {
  const k = 'sale|' + saleKey(it);
  if (Geo.get(k) === undefined) {
    const a = (it.addr || '').replace(/\(.*?\)/g, ' ').replace(/번지|일원|일대|외\s*\d+\s*필지|\s+외$/g, ' ').replace(/\s+/g, ' ').trim();
    let res = await Kakao.addressSearch(a);
    if (!res.length) res = await Kakao.addressSearch(a.split(' ').slice(0, -1).join(' '));
    if (!res.length) res = await Kakao.keyword(it.name, center ? { location: center, radius: 20000 } : {});
    Geo.put(k, res.length ? [+res[0].y, +res[0].x] : 0);
  }
  const g = pt(Geo.get(k)); if (g) { it.lat = g.lat; it.lng = g.lng; }
  return g;
}

async function salesRefresh() {
  if (!S.map) return;
  if (SL.busy) { SL.again = true; return; }
  SL.busy = true;
  try {
    const lvl = S.map.getLevel(), on = SL.visible && lvl <= SALE_MIN_LEVEL && (SL.on.apt || SL.on.ofc);
    if (!on) { for (const k of SL.shown) SL.marks[k]?.ov.setMap(null); SL.shown = new Set(); return; }
    const sggs = await visibleSggs();
    const sds = [...new Set(sggs.map((m) => m.sd))];
    const lists = [];
    if (SL.on.apt) lists.push(...(await Promise.all(sds.map((sd) => loadCh(sd)))).flat().map((x) => Object.assign(x, { __t: 'apt' })));
    if (SL.on.ofc) lists.push(...(await Promise.all(sds.map((sd) => loadOfc(sd)))).flat().map((x) => Object.assign(x, { __t: 'ofc' })));
    const cand = lists.filter((it) => salePeriodOk(it) && sggs.some((m) => inSgg(it, m)));
    const center = S.map.getCenter();
    await pool(cand, 5, (it) => geocodeSale(it, center));
    Geo.flush();
    const b = S.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
    const keep = new Set();
    for (const it of cand) {
      if (!it.lat || it.lat < sw.getLat() || it.lat > ne.getLat() || it.lng < sw.getLng() || it.lng > ne.getLng()) continue;
      const k = saleKey(it); keep.add(k);
      drawSaleMark(it, lvl);
    }
    for (const k of SL.shown) if (!keep.has(k)) SL.marks[k]?.ov.setMap(null);
    SL.shown = keep;
    $('#saleCnt').textContent = keep.size || '';
  } catch (e) { console.warn(e); }
  finally { SL.busy = false; if (SL.again) { SL.again = false; salesRefresh(); } }
}

function drawSaleMark(it, lvl) {
  const k = saleKey(it), st = saleStatus(it), compact = lvl >= 6;
  const sig = k + (compact ? 'c' : '') + (SL.selId === k ? 's' : '');
  const m = SL.marks[k];
  if (m && m.sig === sig) { if (!SL.shown.has(k)) m.ov.setMap(S.map); return; }
  if (m) m.ov.setMap(null);
  const el = document.createElement('div');
  el.className = `mk-sale ${st.k}${SL.selId === k ? ' sel' : ''}`;
  el.style.setProperty('--c', saleColor(it.__t));
  const tag = st.k === 'soon' ? `D-${st.d}` : st.k === 'now' ? '청약중' : '';
  el.innerHTML = `${tag ? `<i>${tag}</i>` : ''}<b>${esc(compact ? it.name.slice(0, 9) + (it.name.length > 9 ? '…' : '') : it.name)}</b><span>${fmtN(it.total)}세대</span>`;
  el.onclick = (e) => { e.stopPropagation(); selectSale(it); };
  const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(it.lat, it.lng), content: el, yAnchor: 1.15, zIndex: st.k === 'soon' || st.k === 'now' ? 9 : 7 });
  ov.setMap(S.map);
  SL.marks[k] = { ov, sig };
}

// ---------- 분양 단지 선택 → 세부내용 ----------
function selectSale(it) {
  const prev = SL.selId; SL.selId = saleKey(it);
  const st = saleStatus(it);
  const site = { id: 'b:' + saleKey(it), sale: it, name: it.name, type: it.kind, stage: st.t, lat: it.lat, lng: it.lng, sido: '', sgg: it.sgg || '', dong: '', households: it.total };
  selectSite(site);
  if (prev !== SL.selId) salesRefresh();
}
function clearSaleSel() { if (SL.selId) { SL.selId = null; salesRefresh(); } }

function saleSummary(it) {
  const ty = (it.types || []).filter((t) => t[0]);
  let sn = 0, ss = 0, gn = 0, gs = 0;
  for (const t of ty) {
    const n = t[3] || 1;
    if (t[2]) { sn += n; ss += (t[2] / (t[0] / 3.3058)) * n; }
    if (t[2] && t[1]) { gn += n; gs += (t[2] / (t[1] / 3.3058)) * n; }
  }
  const prices = ty.map((t) => t[2]).filter(Boolean);
  return { ty, py: sn ? ss / sn : null, gpy: gn ? gs / gn : null, lo: prices.length ? Math.min(...prices) : null, hi: prices.length ? Math.max(...prices) : null };
}

function saleTimeline(it) {
  const steps = [['공고', it.date], ['청약 접수', it.rcept], ['당첨 발표', it.winner], ['계약', it.contract], ['입주', it.mvn ? `${it.mvn.slice(0, 4)}-${it.mvn.slice(4, 6)}` : null]].filter((s) => s[1]);
  const now = TODAY;
  let cur = steps.findIndex((s) => (s[1].length === 7 ? s[1] + '-01' : s[1]) > now);
  if (cur < 0) cur = steps.length;
  return `<div class="stagebar sale">${steps.map(([l, d], i) => `<div class="st ${i < cur ? 'past' : i === cur ? 'now' : ''}" style="--c:${saleColor(it.__t)}"><i></i><span>${l}<br><b>${esc(d.length === 7 ? d.slice(2).replace('-', '.') : d.slice(2).replace(/-/g, '.'))}</b></span></div>`).join('')}</div>`;
}

function saleInfoHTML(s, an) {
  const it = s.sale, st = saleStatus(it), sm = saleSummary(it);
  const comp = it.__t === 'apt'
    ? (it.comp && it.comp.avg1 != null ? `1순위 평균 <b>${it.comp.avg1}:1</b>${it.comp.short ? ` · 미달 ${fmtN(it.comp.short)}세대` : ''}` : st.k === 'soon' ? '접수 전' : it.comp ? '집계 중' : '–')
    : (it.comp && it.comp.rate != null ? `평균 <b>${it.comp.rate}:1</b> (접수 ${fmtN(it.comp.req)}건)` : st.k === 'soon' ? '접수 전' : '–');
  // 주변 시세 대비 (주변 시세 계산이 끝났으면)
  let vs = '';
  const near = summary();
  if (near && sm.py) {
    const base = near.nw?.v || near.all?.v;
    if (base) {
      const p = (sm.py - base) / base * 100;
      vs = `<div class="note strong">전용 평당 분양가 <b>${fmtN(sm.py)}만</b> · 주변 ${fmtR(settings.radius)} ${near.nw ? '10년 이내 단지' : '단지'} 평균 ${fmtN(base)}만 대비 <b class="${p >= 0 ? 'upc' : 'downc'}">${p >= 0 ? '+' : ''}${p.toFixed(1)}%</b></div>`;
    }
  } else if (sm.py && !an.cx) vs = '<div class="meta pad">주변 시세와 비교하는 중…</div>';
  return `
    <div class="sale-top"><span class="badge" style="--c:${saleColor(it.__t)}">${esc(it.__t === 'apt' ? '아파트' : it.kind || '오피스텔')}</span><span class="badge st-${st.k}">${st.k === 'soon' ? `접수 D-${st.d}` : esc(st.t)}</span><span class="meta">${esc(it.kind || '')}</span></div>
    ${saleTimeline(it)}
    ${vs}
    <dl class="dl">
      <dt>소재지</dt><dd>${esc(it.addr || '-')}</dd>
      <dt>공급 규모</dt><dd>${fmtN(it.total)}세대</dd>
      <dt>시공·시행</dt><dd>${esc(it.builder || '-')}</dd>
      <dt>분양가</dt><dd>${sm.lo ? `${fmtEok(sm.lo)} ~ ${fmtEok(sm.hi)}` : '–'}</dd>
      <dt>평당 분양가</dt><dd>${sm.py ? `전용 ${fmtN(sm.py)}만` : '–'}${sm.gpy ? ` <span class="meta">· 공급 ${fmtN(sm.gpy)}만</span>` : ''}</dd>
      <dt>청약 경쟁률</dt><dd>${comp}</dd>
    </dl>
    ${sm.ty.length ? `<div class="sec">주택형별 분양가<small>${sm.ty.length}개 타입 · 최고가 기준</small></div>
      <table class="tbl num"><thead><tr><th>전용</th><th>공급</th><th>세대</th><th>분양가</th><th>전용 평당</th></tr></thead><tbody>
      ${sm.ty.slice().sort((a, b) => a[0] - b[0]).map((t) => `<tr><td>${t[4] ? esc(t[4]) + ' ' : ''}${t[0].toFixed(1)}㎡<small>${(t[0] / 3.3058).toFixed(1)}평</small></td><td>${t[1] ? t[1].toFixed(1) + '㎡' : '–'}</td><td>${fmtN(t[3])}</td><td>${t[2] ? fmtEok(t[2]) : '–'}</td><td>${t[2] ? fmtN(t[2] / (t[0] / 3.3058)) + '만' : '–'}</td></tr>`).join('')}
      </tbody></table>` : ''}
    <div class="btns">${it.url ? `<a class="btn p" href="${esc(it.url)}" target="_blank" rel="noopener">입주자모집공고 보기</a>` : ''}<button class="star ${isSaved('ch', it.id) ? 'on' : ''}" data-savesale="1" title="저장">★</button></div>
    <div class="note">출처: 한국부동산원 청약홈 ${it.__t === 'apt' ? 'APT' : '오피스텔·도시형생활주택'} 분양정보. 분양가는 주택형별 최고가 기준이고, 평당가는 전용면적 기준(주변 실거래 평당가와 같은 기준)이에요.</div>`;
}

// ---------- 탭 패널 ----------
function renderSalePanel() {
  const el = $('#salePanel'); if (!el) return;
  el.innerHTML = `<div class="zf-row">
      <button class="zf-tog ${SL.visible ? 'on' : ''}" data-s="vis">분양 ${SL.visible ? '켜짐' : '꺼짐'}</button>
      ${SALE_TYPES.map(([k, l, c]) => `<button class="chip ${SL.on[k] ? 'on' : ''}${k === 'shop' ? ' dis' : ''}" data-k="${k}" style="--c:${c}"><i></i>${l}</button>`).join('')}
    </div>
    <div class="zf-row" style="margin-top:6px"><span class="lbl">기간</span>${SALE_PERIODS.map(([k, l]) => `<button class="pchip ${SL.period === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
    ${SL.on.shop ? '<div class="note" style="margin:8px 0 0">상가 분양은 청약홈처럼 한곳에 모인 공개 자료가 없어 아직 지도에 표시되지 않아요. LH 단지내 상가 공고(공공데이터포털 활용신청 필요) 등을 연결하면 표시할 수 있어요.</div>' : ''}
    <div class="meta" style="margin-top:6px">구 단위까지 당기면 보여요 · 단지명 · 세대수 표시, 누르면 세부내용</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { SL.on[b.dataset.k] = SL.on[b.dataset.k] ? 0 : 1; LS.set('saleTypes', SL.on); }
    else if (b.dataset.p) { SL.period = b.dataset.p; LS.set('salePeriod', SL.period); }
    else if (b.dataset.s === 'vis') { SL.visible = !SL.visible; LS.set('saleOn', SL.visible); }
    renderSalePanel(); saleTabLabel(); salesRefresh();
  };
}
function saleTabLabel() { $('#ftabs [data-p="sale"]')?.classList.toggle('on', SL.visible); }
function salesInit() {
  kakao.maps.event.addListener(S.map, 'idle', salesRefresh);
  renderSalePanel(); saleTabLabel(); salesRefresh();
}
