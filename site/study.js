/* 정비맵 — 지역 시그널 (지금 보는 지역의 시장 신호판)
   청약 · 실거래가 · 가격 비교 · 여러 단지 비교 · 공급량 · 미분양 · 개발호재
   자료: data/study.json (분양시장 레이더 자료를 매일 요약), data/near/*.json, data/cheongyak/*.json */
'use strict';

// 단색 선 아이콘 (24×24, currentColor)
const ICON = {
  rt: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  us: '<path d="M3 11l9-7 9 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M10 13.5l4 4M14 13.5l-4 4"/>',
  sp: '<rect x="3" y="12" width="5" height="9" rx="1"/><rect x="9.5" y="5" width="5" height="16" rx="1"/><rect x="16" y="9" width="5" height="12" rx="1"/>',
  cy: '<path d="M4 9.5v5a1 1 0 0 0 1 1h3l6 4.5v-16L8 8.5H5a1 1 0 0 0-1 1z"/><path d="M17.5 9a4.5 4.5 0 0 1 0 6"/>',
  dv: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8.5 20.5l2-4.5M15.5 20.5l-2-4.5"/>',
  cmp: '<path d="M5 20V11M12 20V4M19 20v-6"/><path d="M3 20h18"/>',
};
const ico = (k, cls = 'si') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const STUDY_TOOLS = [
  { id: 'rt', name: '실거래가', icon: 'rt' },
  { id: 'us', name: '미분양', icon: 'us' },
  { id: 'sp', name: '공급량', icon: 'sp' },
  { id: 'cy', name: '청약', icon: 'cy' },
  { id: 'dv', name: '개발호재', icon: 'dv' },
  { id: 'vs', name: '1:1 가격 비교', icon: 'cmp' },
  { id: 'mc', name: '여러 단지 비교', icon: 'cmp' },
];
const ST = { data: null, tool: null, level: null, range: 36, usRange: 60, cmp: LS.get('cmp', []), pick: '', projStatus: '전체', fold: LS.get('sigFold', false), sigN: 0 };
const CMP_MAX = 6;
const SERIES = matchMedia('(prefers-color-scheme: dark)').matches
  ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300']
  : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

async function studyData() {
  if (!ST.data) ST.data = getJSON('data/study.json').catch(() => ({}));
  return ST.data;
}

// ---------- 지역 시그널 (왼쪽 창 아래 신호판) ----------
function spark(vals, kind = 'line', color = 'var(--accent)') {
  const v = vals.map((x) => (x == null ? null : +x)); const ok = v.filter((x) => x != null);
  if (ok.length < 2) return '<span class="spk"></span>';
  const W = 64, H = 22, lo = kind === 'bar' ? 0 : Math.min(...ok), hi = Math.max(...ok) || 1;
  const X = (i) => (kind === 'bar' ? (i + 0.5) * W / v.length : i * W / (v.length - 1)), Y = (x) => H - 2 - ((x - lo) / (hi - lo || 1)) * (H - 4);
  if (kind === 'bar') {
    const bw = Math.max(1.2, W / v.length - 1);
    return `<svg class="spk" viewBox="0 0 ${W} ${H}">${v.map((x, i) => x == null ? '' : `<rect x="${X(i) - bw / 2}" y="${Y(x)}" width="${bw}" height="${H - 2 - Y(x)}" rx=".6" style="fill:${color}"/>`).join('')}</svg>`;
  }
  let d = '', pen = false; v.forEach((x, i) => { if (x == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1); pen = true; });
  const li = v.map((x, i) => [x, i]).filter((p) => p[0] != null).pop();
  return `<svg class="spk" viewBox="0 0 ${W} ${H}"><path d="${d}" style="fill:none;stroke:${color}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${X(li[1])}" cy="${Y(li[0])}" r="2" style="fill:${color}"/></svg>`;
}
const delta = (p, txt) => (p == null ? '' : `<span class="dl ${pctCls(p)}">${txt ?? pctTxt(p)}</span>`);

async function signals(d, sc) {
  const out = {};
  // 실거래가
  const t = d.trade, ts = t && tradeSeries(d, sc);
  if (ts) {
    const L = completeLen(t), p3 = wavg(ts.py, ts.n, L - 3, L), pp = wavg(ts.py, ts.n, L - 15, L - 12);
    out.rt = { v: p3 ? `${fmtN(p3)}<small>만/평</small>` : '–', sub: delta(pct(p3, pp), pctTxt(pct(p3, pp), '')) + `<span class="cap">최근 3개월</span>`, spk: spark(ts.py.slice(Math.max(0, L - 24), L)) };
  }
  // 미분양
  const u = d.unsold;
  if (u) {
    const v = sc.lv === 'nat' ? u.nat : sc.lv === 'sd' ? u.sido[sc.sd] : (() => { const k = sggKey(u.sgg[sc.sd], sc.sgg); return k ? u.sgg[sc.sd][k] : null; })();
    if (v) {
      const L = v.length, c = v[L - 1], dd = c - v[L - 2];
      out.us = { v: `${fmtN(c)}<small>호</small>`, sub: delta(dd, (dd >= 0 ? '+' : '') + fmtN(dd)) + `<span class="cap">${ymLabel(u.months[L - 1])} · 전월비</span>`, spk: spark(v.slice(-36), 'line', '#e34948') };
    }
  }
  // 공급량 (인허가, 시도 단위)
  const sp = d.supply, key = sc.lv === 'nat' ? 'nat' : sc.sd, pv = sp?.series?.permit?.[key];
  if (pv) {
    const L = pv.length, a = sum(pv.slice(L - 12)), b = sum(pv.slice(L - 24, L - 12));
    out.sp = { v: `${fmtK(a)}<small>호</small>`, sub: delta(pct(a, b), pctTxt(pct(a, b), '')) + `<span class="cap">인허가 12개월${sc.lv === 'sgg' ? ' · ' + esc(sc.sd) : ''}</span>`, spk: spark(pv.slice(-24), 'bar', '#8fb3ea') };
  }
  // 청약
  const sds = sc.lv === 'nat' ? SIDO : [sc.sd];
  let items = (await Promise.all(sds.map((sd) => loadCh(sd)))).flat();
  if (sc.lv === 'sgg') { const f = sc.sgg.split(' ')[0]; items = items.filter((it) => (it.sgg || '').includes(f) || (it.addr || '').includes(f)); }
  const up = items.filter((it) => it.winner >= TODAY).length;
  const y1 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const past = items.filter((it) => it.winner < TODAY && it.date >= y1), comps = past.map((it) => it.comp?.avg1).filter((x) => x != null);
  out.cy = { v: `${up}<small>건 예정</small>`, sub: `<span class="cap">최근 1년 ${past.length}건${comps.length ? ` · 평균 ${(sum(comps) / comps.length).toFixed(1)}:1` : ''}</span>` };
  // 개발호재
  const P = d.projects?.projects || [];
  const pj = sc.lv === 'nat' ? P : P.filter((p) => (p.regions || []).some(([sd, sg]) => sd === sc.sd && (sc.lv === 'sd' || !sg || sc.sgg.startsWith(sg) || sg.startsWith(sc.sgg.split(' ')[0]))));
  out.dv = { v: `${pj.length}<small>건</small>`, sub: `<span class="cap">${pj.length ? esc(pj.slice(0, 2).map((p) => p.name.split(' (')[0]).join(', ')) : '등록된 사업 없음'}</span>` };
  return out;
}

async function renderStudyGrid() {
  const el = $('#drStudy'); if (!el) return;
  const sc = scopeNow(), n = ++ST.sigN;
  const head = `<button class="sig-h" data-fold="1"><span class="sig-t">지역 시그널</span><span class="sig-w">${esc(scopeLabel(sc))}</span><i>${ST.fold ? '▴' : '▾'}</i></button>`;
  const row = (id, s, name) => `<button class="sig-row" data-tool="${id}">${ico(STUDY_TOOLS.find((x) => x.id === id).icon)}<span class="sig-n">${name}</span><span class="sig-v"><b class="num">${s?.v ?? '…'}</b><span class="sig-s">${s?.sub ?? ''}</span></span>${s?.spk ?? '<span class="spk"></span>'}</button>`;
  const cmpRow = `<div class="sig-row cmp">${ico('cmp')}<span class="sig-n">단지 비교</span><span class="sig-v"><b class="num">${ST.cmp.length}<small>곳 담김</small></b><span class="sig-s"><span class="cap">＋ 버튼으로 담기</span></span></span><span class="sig-btns"><button class="btn sm" data-tool="vs">1:1</button><button class="btn sm" data-tool="mc">여럿</button></span></div>`;
  const draw = (S_) => {
    if (n !== ST.sigN) return;
    el.classList.toggle('fold', ST.fold);
    el.innerHTML = head + `<div class="sig-list">${row('rt', S_.rt, '실거래가')}${row('us', S_.us, '미분양')}${row('sp', S_.sp, '공급량')}${row('cy', S_.cy, '청약')}${row('dv', S_.dv, '개발호재')}${cmpRow}</div>`;
  };
  draw({});
  el.onclick = (e) => {
    if (e.target.closest('[data-fold]')) { ST.fold = !ST.fold; LS.set('sigFold', ST.fold); el.classList.toggle('fold', ST.fold); el.querySelector('.sig-h i').textContent = ST.fold ? '▴' : '▾'; return; }
    const b = e.target.closest('[data-tool]'); if (b) openTool(b.dataset.tool);
  };
  try { draw(await signals(await studyData(), sc)); } catch (e) { console.error(e); }
}

// ---------- 지역 범위 ----------
function scopeNow() {
  const w = S.where || {};
  const lv = ST.level || (w.sgg ? 'sgg' : w.sd ? 'sd' : 'nat');
  if (lv === 'nat' || !w.sd) return { lv: 'nat' };
  if (lv === 'sd' || !w.sgg) return { lv: 'sd', sd: w.sd };
  return { lv: 'sgg', sd: w.sd, sgg: w.sgg, code: w.code };
}
const scopeLabel = (sc) => (sc.lv === 'nat' ? '전국' : sc.lv === 'sd' ? sc.sd : `${sc.sd} ${sc.sgg}`);
function scopeChips(allowSgg = true) {
  const w = S.where || {}, sc = scopeNow();
  const chips = [['nat', '전국']];
  if (w.sd) chips.push(['sd', w.sd]);
  if (w.sgg && allowSgg) chips.push(['sgg', w.sgg]);
  return `<div class="seg scope">${chips.map(([lv, l]) => `<button data-lv="${lv}" class="${sc.lv === lv || (!allowSgg && lv === 'sd' && sc.lv === 'sgg') ? 'on' : ''}">${esc(l)}</button>`).join('')}
    <span class="meta">· 지도를 옮기거나 왼쪽에서 지역을 고르면 바뀌어요</span></div>`;
}
// 거래·미분양 자료의 시군구 이름 찾기 ('수원시 장안구' → '수원시 장안구' 또는 '수원시')
function sggKey(obj, sgg) {
  if (!obj || !sgg) return null;
  if (obj[sgg]) return sgg;
  const first = sgg.split(' ')[0];
  if (obj[first]) return first;
  return Object.keys(obj).find((k) => k.replace(/\s/g, '') === sgg.replace(/\s/g, '')) || null;
}
function codeOf(sd, sgg) {
  if (!S.meta || !sgg) return null;
  const e = Object.entries(S.meta.codes);
  return (e.find(([, v]) => v.sd === sd && v.n === sgg) || e.find(([, v]) => v.sd === sd && v.n.startsWith(sgg.split(' ')[0])) || [])[0] || null;
}

// ---------- 열고 닫기 ----------
async function openTool(id) {
  ST.tool = id;
  openDrawer(true);
  $('#drawer').classList.add('tool');
  const t = STUDY_TOOLS.find((x) => x.id === id);
  $('#drTool').innerHTML = `<div class="tl-head"><button class="x" data-back="1" title="시그널로 돌아가기">←</button>${ico(t.icon, 'si big')}<b>${t.name}</b><span class="tl-w">지역 시그널</span></div><div class="tl-body" id="tlBody"><div class="empty">불러오는 중…</div></div>`;
  $('#drTool').onclick = onToolClick;
  $('#drTool').oninput = onToolInput;
  await renderTool();
}
function closeTool() { ST.tool = null; $('#drawer').classList.remove('tool'); renderStudyGrid(); }
async function renderTool() {
  if (!ST.tool) return;
  const d = await studyData();
  const fn = { cy: toolCheongyak, rt: toolTrade, vs: toolVs, mc: toolMulti, sp: toolSupply, us: toolUnsold, dv: toolProjects }[ST.tool];
  const body = $('#tlBody'); if (!body) return;
  try { body.innerHTML = await fn(d); } catch (e) { console.error(e); body.innerHTML = '<div class="empty">자료를 불러오지 못했어요.</div>'; }
}
function onStudyWhere() { // 지도 위치가 바뀌면
  renderStudyGrid();
  if (ST.tool && ST.tool !== 'vs' && ST.tool !== 'mc') renderTool();
}

async function onToolClick(e) {
  const t = e.target;
  if (t.closest('[data-back]')) return closeTool();
  if (t.closest('a')) return;
  const lv = t.closest('[data-lv]'); if (lv) { ST.level = lv.dataset.lv; renderStudyGrid(); return renderTool(); }
  const rg = t.closest('[data-range]'); if (rg) { ST[rg.dataset.key || 'range'] = +rg.dataset.range; return renderTool(); }
  const ps = t.closest('[data-pst]'); if (ps) { ST.projStatus = ps.dataset.pst; return renderTool(); }
  const sg = t.closest('[data-sgg]');
  if (sg) { // 시도 표에서 시군구 고르기 → 그 구로 지도 이동
    const sd = sg.dataset.sd, n = sg.dataset.sgg, code = codeOf(sd, n);
    S.where = { sd, sgg: (code && S.meta.codes[code].n) || n, code }; ST.level = 'sgg';
    if (code) { const p = await geocodeOnce(code, `${SIDO_FULL[sd] || sd} ${S.meta.codes[code].n}`); if (p) moveTo(p, 7); }
    renderStudyGrid(); return renderTool();
  }
  const add = t.closest('[data-cmpadd]'); if (add) { cmpToggle(JSON.parse(add.dataset.cmpadd)); return renderTool(); }
  const rm = t.closest('[data-cmprm]'); if (rm) { ST.cmp = ST.cmp.filter((x) => cmpKey(x) !== rm.dataset.cmprm); LS.set('cmp', ST.cmp); renderStudyGrid(); return renderTool(); }
  if (t.closest('[data-cmpclear]')) { ST.cmp = []; LS.set('cmp', ST.cmp); renderStudyGrid(); return renderTool(); }
  const it = t.closest('.item'); if (it && !t.closest('button')) it.classList.toggle('open');
}
let pickT = null;
function onToolInput(e) {
  if (e.target.id !== 'cmpQ') return;
  clearTimeout(pickT);
  pickT = setTimeout(async () => { ST.pick = e.target.value.trim(); const box = $('#pickRes'); if (box) box.innerHTML = await pickResults(); }, 200);
}

// ---------- 공통 그림 도우미 ----------
const CH = {}; let chN = 0;
function niceMax(v) { if (!v) return 1; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
const fmtK = (v) => (v == null ? '–' : Math.abs(v) >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + '만' : fmtN(v));
const ymLabel = (m) => (m.length === 6 ? `${m.slice(2, 4)}.${m.slice(4)}` : m.replace(/^20/, '').replace('Q', 'Q'));
/* kind: 'line' | 'bar' · series: [{name, vals, color}] · 축은 하나 */
function chart({ kind = 'line', labels, series, h = 150, unit = '', minZero = kind === 'bar', mark = false }) {
  const id = 'c' + ++chN, W = 420, H = h, L = 40, Rt = 8, T = 10, B = 22;
  const all = series.flatMap((s) => s.vals).filter((v) => v != null);
  if (!all.length) return '<div class="meta" style="padding:10px 2px">자료가 없어요</div>';
  let lo = minZero ? 0 : Math.min(...all), hi = Math.max(...all);
  if (!minZero) { const pad = (hi - lo) * 0.12 || hi * 0.05 || 1; lo = Math.max(0, lo - pad); hi += pad; }
  const top = minZero ? niceMax(hi) : hi;
  const n = labels.length, iw = W - L - Rt, ih = H - T - B;
  const X = (i) => L + (n === 1 ? iw / 2 : kind === 'bar' ? (i + 0.5) * iw / n : i * iw / (n - 1));
  const Y = (v) => T + ih - ((v - lo) / (top - lo || 1)) * ih;
  const ticks = [lo, (lo + top) / 2, top];
  let g = ticks.map((v) => `<line x1="${L}" x2="${W - Rt}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3.5}" class="ax" text-anchor="end">${fmtK(v)}</text>`).join('');
  const step = Math.ceil(n / 6);
  g += labels.map((lb, i) => (i % step === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < step * 0.6) ? `<text x="${X(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(ymLabel(lb))}</text>` : '').join('');
  let marks = '';
  if (kind === 'bar') {
    const bw = Math.max(2, iw / n - 2);
    const s = series[0];
    marks = s.vals.map((v, i) => v == null ? '' : `<rect x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Math.max(0, T + ih - Y(v))}" rx="${Math.min(3, bw / 3)}" style="fill:${s.color}"/>`).join('');
  } else {
    for (const s of series) {
      let d = '', pen = false;
      s.vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
      marks += `<path d="${d}" style="fill:none;stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const li = s.vals.map((v, i) => [v, i]).filter((x) => x[0] != null).pop();
      if (li) marks += `<circle cx="${X(li[1])}" cy="${Y(li[0])}" r="3.5" style="fill:${s.color};stroke:var(--card)" stroke-width="2"/>`;
    }
    if (mark && series.length === 1) { // 최고·최저 표시
      const v = series[0].vals; let mx = -1, mn = -1;
      v.forEach((x, i) => { if (x == null) return; if (mx < 0 || x > v[mx]) mx = i; if (mn < 0 || x < v[mn]) mn = i; });
      for (const [i, lb] of [[mx, '최고'], [mn, '최저']]) {
        if (i < 0) continue;
        let y = Y(v[i]) + (lb === '최고' ? -6 : 13);
        if (y > T + ih - 3) y = Y(v[i]) - 6;      // 바닥에 붙으면 점 위로
        if (y < T + 8) y = Y(v[i]) + 13;           // 천장에 붙으면 점 아래로
        const x = Math.min(W - Rt - 24, Math.max(L + 24, X(i)));
        marks += `<text x="${x}" y="${y}" class="pk" text-anchor="middle">${lb} ${fmtK(v[i])}</text>`;
      }
    }
  }
  CH[id] = { labels, series, unit, X, W, n, kind };
  const legend = series.length > 1 ? `<div class="lg">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<div class="chart" data-cid="${id}"><svg viewBox="0 0 ${W} ${H}" role="img">${g}${marks}<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ih}"/></svg><div class="tip"></div></div>`;
}
document.addEventListener('pointermove', (e) => {
  const c = e.target.closest?.('.chart');
  document.querySelectorAll('.chart.hov').forEach((x) => { if (x !== c) x.classList.remove('hov'); });
  if (!c) return;
  const spec = CH[c.dataset.cid]; if (!spec) return;
  const svg = c.querySelector('svg'), r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * spec.W;
  let best = 0, bd = 1e9; for (let i = 0; i < spec.n; i++) { const d = Math.abs(spec.X(i) - x); if (d < bd) { bd = d; best = i; } }
  c.classList.add('hov');
  const xh = svg.querySelector('.xh'); xh.setAttribute('x1', spec.X(best)); xh.setAttribute('x2', spec.X(best));
  const tip = c.querySelector('.tip');
  tip.innerHTML = `<b>${esc(spec.labels[best])}</b>${spec.series.map((s) => `<div><i style="background:${s.color}"></i>${spec.series.length > 1 ? esc(s.name) + ' ' : ''}<b>${s.vals[best] == null ? '–' : fmtN(s.vals[best])}</b>${spec.unit}</div>`).join('')}`;
  const px = spec.X(best) / spec.W * r.width;
  tip.style.left = Math.min(r.width - 150, Math.max(0, px + 10)) + 'px';
});
document.addEventListener('pointerleave', () => document.querySelectorAll('.chart.hov').forEach((x) => x.classList.remove('hov')), true);

const kpi = (lbl, v, sub, cls = '') => `<div class="kpi"><small>${lbl}</small><b class="num">${v}</b>${sub ? `<span class="ks ${cls}">${sub}</span>` : ''}</div>`;
const pct = (a, b) => (a == null || !b ? null : (a - b) / b * 100);
const pctTxt = (p, unitWord = '') => (p == null ? '' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%${unitWord}`);
const pctCls = (p) => (p == null || p === 0 ? '' : p > 0 ? 'up' : 'down'); // 오르면 빨강, 내리면 파랑
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const sec = (t, sub = '') => `<div class="sec">${t}${sub ? `<small>${sub}</small>` : ''}</div>`;

// ---------- 1. 청약 ----------
async function toolCheongyak() {
  const sc = scopeNow();
  const sds = sc.lv === 'nat' ? SIDO : [sc.sd];
  let items = (await Promise.all(sds.map((sd) => loadCh(sd).then((a) => a.map((x) => Object.assign({ sd }, x)))))).flat();
  if (sc.lv === 'sgg') { const f = sc.sgg.split(' ')[0]; items = items.filter((it) => (it.sgg || '').includes(f) || (it.addr || '').includes(f)); }
  const up = items.filter((it) => it.winner >= TODAY).sort((a, b) => a.rcept.localeCompare(b.rcept));
  const y1 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const past = items.filter((it) => it.winner < TODAY && it.date >= y1).sort((a, b) => b.date.localeCompare(a.date));
  const comps = past.map((it) => it.comp?.avg1).filter((v) => v != null);
  let sn = 0, ss = 0; for (const it of past) for (const t of it.types || []) if (t[0] && t[2]) { sn += t[3] || 1; ss += (t[2] / (t[0] / 3.3058)) * (t[3] || 1); }
  return scopeChips() + `<div class="kpis k4">
      ${kpi('접수 예정·진행', fmtN(up.length) + '건')}
      ${kpi('최근 1년 분양', fmtN(past.length) + '건', fmtN(sum(past.map((x) => x.total))) + '세대')}
      ${kpi('평균 1순위 경쟁률', comps.length ? (sum(comps) / comps.length).toFixed(1) + ':1' : '–')}
      ${kpi('전용 평당 분양가', sn ? fmtN(ss / sn) + '만' : '–')}
    </div>`
    + sec('접수 예정·진행', up.length + '건') + (up.length ? `<div class="card flat">${up.map((it) => chCard(Object.assign({}, it, { d: null }), false)).join('')}</div>` : '<div class="meta pad">예정된 청약이 없어요</div>')
    + sec('최근 1년 분양 결과', past.length + '건') + (past.length ? `<div class="card flat">${past.slice(0, 60).map((it) => chCard(Object.assign({}, it, { d: null }), false)).join('')}</div>` : '<div class="meta pad">최근 1년 분양이 없어요</div>')
    + '<div class="note">청약홈 입주자모집공고 기준. 평당 분양가는 전용면적 기준이에요.</div>';
}

// ---------- 2. 실거래가 ----------
function tradeSeries(d, sc) {
  const t = d.trade; if (!t) return null;
  if (sc.lv === 'nat') return t.nat;
  if (sc.lv === 'sd') return t.sido[sc.sd];
  const kids = t.sgg[sc.sd]; const k = sggKey(kids, sc.sgg); return k ? kids[k] : null;
}
function completeLen(t) { // 막 시작된 달(거래 신고 중)은 빼기
  const n = t.nat.n, L = n.length;
  const prev = sum(n.slice(L - 4, L - 1)) / 3;
  return n[L - 1] != null && n[L - 1] < prev * 0.45 ? L - 1 : L;
}
function wavg(py, n, a, b) { let s = 0, c = 0; for (let i = a; i < b; i++) if (py[i] != null && n[i]) { s += py[i] * n[i]; c += n[i]; } return c ? s / c : null; }
async function toolTrade(d) {
  const t = d.trade; if (!t) return '<div class="empty">실거래 자료가 없어요</div>';
  const sc = scopeNow(), s = tradeSeries(d, sc);
  if (!s) return scopeChips() + '<div class="empty">이 지역의 실거래 자료가 없어요</div>';
  const L = completeLen(t), months = t.months.slice(0, L), from = Math.max(0, L - ST.range);
  const n3 = sum(s.n.slice(L - 3, L)), n3p = sum(s.n.slice(L - 15, L - 12));
  const p3 = wavg(s.py, s.n, L - 3, L), p3p = wavg(s.py, s.n, L - 15, L - 12);
  let html = scopeChips() + `<div class="kpis k3">
      ${kpi('최근 3개월 거래', fmtN(n3) + '건', pctTxt(pct(n3, n3p), ' 전년비'), pctCls(pct(n3, n3p)))}
      ${kpi('최근 3개월 평당가', p3 ? fmtN(p3) + '만' : '–', pctTxt(pct(p3, p3p), ' 전년비'), pctCls(pct(p3, p3p)))}
      ${kpi('기준월', ymLabel(months[L - 1]))}
    </div>
    <div class="seg" style="margin:4px 0 8px"><span class="lbl">기간</span>${[12, 24, 36].map((r) => `<button data-range="${r}" class="${ST.range === r ? 'on' : ''}">${r / 12}년</button>`).join('')}</div>`
    + sec('평당가 추이', '월 중위값 · 만원/전용 3.3㎡') + chart({ labels: months.slice(from), series: [{ name: '평당가', vals: s.py.slice(from, L), color: 'var(--accent)' }], unit: '만', mark: true })
    + sec('거래량', '월 · 건') + chart({ kind: 'bar', labels: months.slice(from), series: [{ name: '거래', vals: s.n.slice(from, L), color: 'var(--accent2)' }], h: 110, unit: '건' });
  if (sc.lv === 'sd' || sc.lv === 'nat') {
    const list = sc.lv === 'nat'
      ? Object.entries(t.sido).map(([k, v]) => ({ sd: k, k, v }))
      : Object.entries(t.sgg[sc.sd] || {}).map(([k, v]) => ({ sd: sc.sd, k, v }));
    const rows = list.map(({ sd, k, v }) => ({ sd, k, n12: sum(v.n.slice(L - 12, L)), p12: wavg(v.py, v.n, L - 12, L), pp: wavg(v.py, v.n, L - 24, L - 12), lead: sc.lv === 'sd' ? t.leader?.[sd]?.[k] : null }))
      .filter((r) => r.p12).sort((a, b) => b.p12 - a.p12);
    html += sec(sc.lv === 'nat' ? '시도별 평당가' : '시군구별 평당가', '최근 12개월') + `<table class="tbl num"><thead><tr><th>${sc.lv === 'nat' ? '시도' : '시군구'}</th><th>평당가</th><th>전년비</th><th>거래</th></tr></thead><tbody>
      ${rows.map((r) => `<tr ${sc.lv === 'sd' ? `data-sd="${esc(r.sd)}" data-sgg="${esc(r.k)}" class="link"` : ''}><td>${esc(r.k)}${r.lead ? `<small>${esc(r.lead.apt)} ${fmtN(r.lead.py12)}만</small>` : ''}</td><td>${fmtN(r.p12)}만</td><td class="${pctCls(pct(r.p12, r.pp))}">${pctTxt(pct(r.p12, r.pp))}</td><td>${fmtN(r.n12)}</td></tr>`).join('')}
      </tbody></table>${sc.lv === 'sd' ? '<div class="meta pad">시군구를 누르면 그 지역 단지 순위가 나와요</div>' : ''}`;
  } else {
    const code = sc.code || codeOf(sc.sd, sc.sgg);
    const f = code ? await loadNear(code) : null;
    if (f) {
      const cx = f.cx.filter((r) => r[3] > 0).sort((a, b) => b[4] - a[4]).slice(0, 40);
      html += sec('단지별 평당가 순위', `최근 12개월 · ${cx.length}개 단지`) + cx.map((r, i) => cxRow({ code, apt: r[0], dong: r[1], by: r[2], n12: r[3], py12: r[4], py36: r[7], last: r[8], deals: r[10] }, i + 1)).join('');
    }
  }
  return html + `<div class="note">${esc(t.source || '국토교통부 아파트 매매 실거래가')}. 평당가는 전용면적 기준 중위값이라 공급면적 기준 시세보다 높게 보여요.</div>`;
}
const cmpKey = (x) => `${x.code}|${x.dong}|${x.apt}`;
function cxRow(c, rank) {
  const on = ST.cmp.some((x) => cmpKey(x) === cmpKey(c));
  const deal = (c.deals || [])[0];
  return `<div class="item cxr"><div class="row">
      ${rank ? `<span class="rk">${rank}</span>` : ''}
      <div class="grow"><div class="nm">${esc(c.apt)}</div><div class="meta">${esc(c.dong)} · ${c.by ? c.by + '년' : '준공 미상'}${c.n12 ? ` · 12개월 ${c.n12}건` : ''}${deal ? ` · 최근 ${fmtEok(deal[3])}` : ''}</div></div>
      <div class="pr num">${fmtN(c.py12 || c.py36)}만<small>평당</small></div>
      <button class="cmpb ${on ? 'on' : ''}" data-cmpadd='${esc(JSON.stringify({ code: c.code, dong: c.dong, apt: c.apt }))}' title="비교에 담기">${on ? '✓' : '＋'}</button>
    </div></div>`;
}

// ---------- 3·4. 단지 비교 ----------
function cmpToggle(c) {
  const k = cmpKey(c), i = ST.cmp.findIndex((x) => cmpKey(x) === k);
  if (i >= 0) ST.cmp.splice(i, 1);
  else { if (ST.cmp.length >= CMP_MAX) { toast(`비교는 ${CMP_MAX}개 단지까지예요`); return; } ST.cmp.push(c); toast(`비교에 담았어요 (${ST.cmp.length})`); }
  LS.set('cmp', ST.cmp); renderStudyGrid();
}
async function cmpRows() {
  const out = [];
  for (const c of ST.cmp) {
    const f = await loadNear(c.code); const r = f?.cx.find((x) => x[0] === c.apt && x[1] === c.dong);
    out.push(r ? { ...c, sgg: f.n, sd: f.sd, by: r[2], n12: r[3], py12: r[4], amt12: r[5], n36: r[6], py36: r[7], last: r[8], q: r[9], deals: r[10], quarters: f.quarters } : { ...c, missing: true });
  }
  return out;
}
async function pickResults() {
  const q = norm(ST.pick); if (!q) return '';
  const sc = scopeNow();
  let codes = [];
  if (sc.lv === 'sgg') codes = [sc.code || codeOf(sc.sd, sc.sgg)];
  else if (sc.lv === 'sd') codes = Object.entries(S.meta.codes).filter(([, v]) => v.sd === sc.sd).map(([k]) => k);
  else codes = Object.keys(S.meta.codes);
  if (codes.length > 30 && q.length < 2) return '<div class="meta pad">두 글자 이상 입력해 주세요</div>';
  const files = (await Promise.all(codes.filter(Boolean).map(loadNear))).filter(Boolean);
  const hits = [];
  for (const f of files) for (const r of f.cx) if (norm(r[0]).includes(q)) { hits.push({ code: f.code, apt: r[0], dong: r[1], by: r[2], n12: r[3], py12: r[4], py36: r[7], deals: r[10], sgg: f.n }); if (hits.length > 40) break; }
  hits.sort((a, b) => b.n12 - a.n12);
  return hits.length ? hits.slice(0, 20).map((c) => cxRow(Object.assign({}, c, { dong: c.dong }), 0).replace('<div class="meta">', `<div class="meta">${esc(c.sgg)} · `)).join('') : '<div class="meta pad">찾는 단지가 없어요 (최근 3년 거래된 아파트만 나와요)</div>';
}
function picker() {
  const sc = scopeNow();
  return `<div class="picker"><input class="input" id="cmpQ" placeholder="${esc(scopeLabel(sc))}에서 단지 이름 검색" value="${esc(ST.pick)}" autocomplete="off"><div id="pickRes"></div></div>`;
}
async function toolVs() {
  const rows = (await cmpRows()).slice(0, 2);
  let html = scopeChips();
  if (rows.length < 2) {
    return html + `<div class="note">비교할 단지 2곳을 담아 주세요. 지금 <b>${rows.length}</b>곳. 아래에서 검색하거나 <b>실거래가</b>·<b>주변 시세</b> 목록의 ＋ 버튼으로 담을 수 있어요.</div>`
      + (rows.length ? rows.map((r) => cmpCard(r, 0)).join('') : '') + picker();
  }
  const [a, b] = rows;
  const diff = a.py12 && b.py12 ? a.py12 - b.py12 : null;
  html += `<div class="vs">${cmpCard(a, 0)}<div class="vs-mid">VS</div>${cmpCard(b, 1)}</div>`;
  if (diff != null) html += `<div class="note strong"><b>${esc(diff >= 0 ? a.apt : b.apt)}</b>이(가) 평당 <b>${fmtN(Math.abs(diff))}만원</b>(${Math.abs(diff / Math.min(a.py12, b.py12) * 100).toFixed(1)}%) 높아요 · 최근 12개월 기준</div>`;
  html += sec('분기별 평당가', '만원/전용 3.3㎡') + chart({ labels: a.quarters, series: [a, b].map((r, i) => ({ name: r.apt, vals: r.q, color: SERIES[i] })), unit: '만' });
  html += `<table class="tbl num"><thead><tr><th></th><th>${esc(a.apt)}</th><th>${esc(b.apt)}</th></tr></thead><tbody>
    ${[['지역', (r) => `${r.sgg} ${r.dong}`], ['준공', (r) => (r.by ? `${r.by}년 (${THIS_YEAR - r.by}년차)` : '–')], ['평당가 12개월', (r) => fmtN(r.py12) + '만'], ['평당가 36개월', (r) => fmtN(r.py36) + '만'], ['거래 12개월', (r) => r.n12 + '건'], ['대표 거래가', (r) => fmtEok(r.amt12)], ['마지막 거래', (r) => fmtYm(r.last)]]
      .map(([l, f]) => `<tr><td>${l}</td><td>${esc(f(a))}</td><td>${esc(f(b))}</td></tr>`).join('')}</tbody></table>`;
  if (ST.cmp.length > 2) html += `<div class="meta pad">담긴 단지 중 앞의 2곳을 비교해요. 전체는 <b>여러 단지 비교</b>에서 볼 수 있어요.</div>`;
  return html + sec('단지 바꾸기') + picker();
}
function cmpCard(r, i) {
  const d = (r.deals || []).slice(0, 2);
  return `<div class="ccard" style="--c:${SERIES[i] || SERIES[0]}"><button class="x sm" data-cmprm="${esc(cmpKey(r))}" title="빼기">✕</button>
    <div class="cc-nm">${esc(r.apt)}</div><div class="meta">${esc(r.sgg || '')} ${esc(r.dong)}${r.by ? ` · ${r.by}년` : ''}</div>
    ${r.missing ? '<div class="meta">거래 자료 없음</div>' : `<div class="cc-v num">${fmtN(r.py12 || r.py36)}<small>만/평</small></div>
    <div class="meta">12개월 ${r.n12}건${d.length ? '<br>' + d.map((x) => `${x[0].slice(2, 4)}.${x[0].slice(4, 6)} ${x[1]}㎡ ${fmtEok(x[3])}`).join('<br>') : ''}</div>`}</div>`;
}
async function toolMulti() {
  const rows = await cmpRows();
  let html = scopeChips() + `<div class="row" style="margin:2px 0 8px"><div class="grow meta">담긴 단지 <b>${rows.length}</b> / ${CMP_MAX}</div>${rows.length ? '<button class="btn sm" data-cmpclear="1">모두 비우기</button>' : ''}</div>`;
  if (!rows.length) return html + '<div class="note">비교할 단지를 담아 주세요. 아래에서 검색하거나 <b>실거래가</b>·<b>주변 시세</b> 목록의 ＋ 버튼으로 담을 수 있어요.</div>' + picker();
  const ok = rows.filter((r) => !r.missing);
  if (ok.length) html += sec('분기별 평당가', '만원/전용 3.3㎡') + chart({ labels: ok[0].quarters, series: ok.map((r) => ({ name: r.apt, vals: r.q, color: SERIES[rows.indexOf(r)] })), unit: '만', h: 180 });
  const maxPy = Math.max(...ok.map((r) => r.py12 || 0));
  html += `<div class="mlist">${rows.map((r, i) => `<div class="mrow" style="--c:${SERIES[i]}"><i></i><div class="grow"><b>${esc(r.apt)}</b><small>${esc(r.sgg || '')} ${esc(r.dong)}${r.by ? ` · ${r.by}년` : ''}${r.n12 ? ` · 12개월 ${r.n12}건` : ''}</small>
      ${r.py12 ? `<div class="hbar"><span style="width:${(r.py12 / maxPy * 100).toFixed(1)}%"></span></div>` : ''}</div>
      <div class="pr num">${r.missing ? '–' : fmtN(r.py12 || r.py36) + '만'}<small>평당</small></div><button class="x sm" data-cmprm="${esc(cmpKey(r))}" title="빼기">✕</button></div>`).join('')}</div>`;
  return html + (rows.length < CMP_MAX ? sec('단지 더 담기') + picker() : '');
}

// ---------- 5. 공급량 ----------
async function toolSupply(d) {
  const sp = d.supply; if (!sp || !sp.months.length) return '<div class="empty">공급 자료가 없어요</div>';
  const sc = scopeNow(), key = sc.lv === 'nat' ? 'nat' : sc.sd;
  const m = sp.months, L = m.length;
  let html = scopeChips(false) + (sc.lv === 'sgg' ? `<div class="meta pad">공급 통계는 시도 단위로 발표돼서 <b>${esc(sc.sd)}</b> 값을 보여줘요. 아래에 ${esc(sc.sgg)} 입주 예정 단지를 함께 붙였어요.</div>` : '');
  const order = ['permit', 'start', 'sale'];
  const k = order.map((nm) => { const v = sp.series[nm]?.[key] || []; const a = sum(v.slice(L - 12)), b = sum(v.slice(L - 24, L - 12)); return { nm, a, p: pct(a, b) }; });
  html += `<div class="kpis k3">${k.map((x) => kpi(`${sp.labels[x.nm] || x.nm} 12개월`, fmtK(x.a) + '호', pctTxt(x.p, ' 전년비'), pctCls(x.p))).join('')}</div>`;
  const mv = d.moveIn, rec = mv ? (sc.lv === 'nat' ? mv.national : mv.sido?.[sc.sd]) : null;
  if (rec) html += `<div class="note strong">🏢 ${esc(sc.lv === 'nat' ? '전국' : sc.sd)} 입주예정 <b>${fmtN(rec.total)}가구</b> (${mv.years[0]}~${mv.years.at(-1)})${rec.byYear ? ' · ' + Object.entries(rec.byYear).map(([y, v]) => `${y}년 ${fmtN(v)}`).join(' · ') : ''}<br><small>${esc(mv.source)}</small></div>`;
  const from = Math.max(0, L - 36);
  for (const nm of order) {
    const v = sp.series[nm]?.[key]; if (!v) continue;
    html += sec(sp.labels[nm] || nm, '월 · 호') + chart({ kind: 'bar', labels: m.slice(from), series: [{ name: sp.labels[nm], vals: v.slice(from), color: nm === 'sale' ? 'var(--accent)' : nm === 'start' ? 'var(--accent2)' : '#8fb3ea' }], h: 110, unit: '호' });
  }
  // 입주 예정 단지 (청약 자료의 입주 예정월)
  const items = (await Promise.all((sc.lv === 'nat' ? [] : [sc.sd]).map(loadCh))).flat();
  let mvl = items.filter((it) => it.mvn && it.mvn >= NOW_YM);
  if (sc.lv === 'sgg') { const f = sc.sgg.split(' ')[0]; mvl = mvl.filter((it) => (it.sgg || '').includes(f) || (it.addr || '').includes(f)); }
  if (sc.lv !== 'nat') {
    mvl.sort((a, b) => a.mvn.localeCompare(b.mvn));
    const byY = {}; for (const it of mvl) byY[it.mvn.slice(0, 4)] = (byY[it.mvn.slice(0, 4)] || 0) + (it.total || 0);
    html += sec(`🏢 ${esc(scopeLabel(sc))} 입주 예정 단지`, `${mvl.length}곳 · ${Object.entries(byY).map(([y, v]) => `${y.slice(2)}년 ${fmtN(v)}세대`).join(' · ')}`)
      + (mvl.length ? `<div class="card flat">${mvl.slice(0, 50).map((it) => chCard(Object.assign({}, it, { d: null }), false)).join('')}</div>` : '<div class="meta pad">최근 3년 분양분 중 입주 예정 단지가 없어요</div>');
  }
  return html + '<div class="note">국토교통부 주택 인허가·착공·분양 실적(KOSIS). 인허가 → 착공 → 분양 → 입주(2~3년 뒤) 순으로 이어져요. 입주 예정 단지는 청약홈 분양분 기준이라 재건축·임대 등 일부가 빠질 수 있어요.</div>';
}

// ---------- 6. 미분양 ----------
async function toolUnsold(d) {
  const u = d.unsold; if (!u) return '<div class="empty">미분양 자료가 없어요</div>';
  const sc = scopeNow();
  let v = sc.lv === 'nat' ? u.nat : sc.lv === 'sd' ? u.sido[sc.sd] : (() => { const k = sggKey(u.sgg[sc.sd], sc.sgg); return k ? u.sgg[sc.sd][k] : null; })();
  if (!v) return scopeChips() + '<div class="empty">이 지역 미분양 자료가 없어요</div>';
  const L = u.months.length, cur = v[L - 1], mom = pct(cur, v[L - 2]), yoy = pct(cur, v[L - 13]);
  const from = Math.max(0, L - ST.usRange);
  const hug = d.hug?.rounds?.[0];
  const inHug = hug && sc.lv === 'sgg' ? hug.zones.find((z) => z.sd === sc.sd && sc.sgg.startsWith(z.sgg)) : null;
  let html = scopeChips() + `<div class="kpis k3">
      ${kpi(`미분양 (${ymLabel(u.months[L - 1])})`, fmtN(cur) + '호')}
      ${kpi('전월 대비', mom == null ? '–' : (cur - v[L - 2] >= 0 ? '+' : '') + fmtN(cur - v[L - 2]) + '호', pctTxt(mom), pctCls(mom, false))}
      ${kpi('전년 동월 대비', yoy == null ? '–' : (cur - v[L - 13] >= 0 ? '+' : '') + fmtN(cur - v[L - 13]) + '호', pctTxt(yoy), pctCls(yoy, false))}
    </div>`
    + (inHug ? `<div class="note warn">⚠️ HUG 미분양관리지역 (${esc(hug.from)}~${esc(hug.to)}, ${esc(inHug.st)})</div>` : '')
    + `<div class="seg" style="margin:4px 0 8px"><span class="lbl">기간</span>${[[12, '1년'], [36, '3년'], [60, '5년'], [120, '10년']].map(([r, l]) => `<button data-range="${r}" data-key="usRange" class="${ST.usRange === r ? 'on' : ''}">${l}</button>`).join('')}</div>`
    + sec('미분양 추이', '호') + chart({ labels: u.months.slice(from), series: [{ name: '미분양', vals: v.slice(from), color: '#e34948' }], unit: '호', mark: true, minZero: true });
  if (sc.lv !== 'sgg') {
    const list = sc.lv === 'nat' ? Object.entries(u.sido).map(([k, s]) => ({ sd: k, k, s })) : Object.entries(u.sgg[sc.sd] || {}).map(([k, s]) => ({ sd: sc.sd, k, s }));
    const rows = list.map((r) => ({ ...r, c: r.s[L - 1], p: r.s[L - 2] })).filter((r) => r.c != null).sort((a, b) => b.c - a.c);
    const hugSet = new Set((hug?.zones || []).map((z) => z.sd + '|' + z.sgg));
    html += sec(sc.lv === 'nat' ? '시도별 미분양' : '시군구별 미분양', ymLabel(u.months[L - 1])) + `<table class="tbl num"><thead><tr><th>${sc.lv === 'nat' ? '시도' : '시군구'}</th><th>미분양</th><th>전월비</th></tr></thead><tbody>
      ${rows.slice(0, 40).map((r) => `<tr ${sc.lv === 'sd' ? `data-sd="${esc(r.sd)}" data-sgg="${esc(r.k)}" class="link"` : ''}><td>${esc(r.k)}${hugSet.has(r.sd + '|' + r.k) ? ' <span class="badge" style="--c:#e34948">관리지역</span>' : ''}</td><td>${fmtN(r.c)}</td><td class="${pctCls(r.c - r.p, false)}">${r.p == null ? '–' : (r.c - r.p >= 0 ? '+' : '') + fmtN(r.c - r.p)}</td></tr>`).join('')}</tbody></table>`;
  }
  return html + `<div class="note">${esc(u.source || 'KOSIS 미분양주택현황')}. 매달 말 전월 자료가 발표돼요.${hug ? ` HUG 미분양관리지역: ${hug.zones.map((z) => `${z.sd} ${z.sgg}`).join(', ')} (${esc(hug.round)}).` : ''}</div>`;
}

// ---------- 7. 개발호재 ----------
async function toolProjects(d) {
  const P = d.projects; if (!P) return '<div class="empty">개발호재 자료가 없어요</div>';
  const sc = scopeNow();
  let list = P.projects;
  if (sc.lv !== 'nat') list = list.filter((p) => (p.regions || []).some(([sd, sg]) => sd === sc.sd && (sc.lv === 'sd' || !sg || sc.sgg.startsWith(sg) || sg.startsWith(sc.sgg.split(' ')[0]))));
  const sts = ['전체', ...P.statusOrder.filter((s) => list.some((p) => p.status === s))];
  if (!sts.includes(ST.projStatus)) ST.projStatus = '전체';
  const shown = list.filter((p) => ST.projStatus === '전체' || p.status === ST.projStatus)
    .sort((a, b) => P.statusOrder.indexOf(a.status) - P.statusOrder.indexOf(b.status));
  const stColor = { 운영: '#2f9e44', '부분 운영': '#1baf7a', 공사: '#2a78d6', '인허가·설계': '#eda100', 계획: '#868e96' };
  return scopeChips() + `<div class="seg" style="margin:2px 0 10px">${sts.map((s) => `<button data-pst="${esc(s)}" class="${ST.projStatus === s ? 'on' : ''}">${esc(s)} ${s === '전체' ? list.length : list.filter((p) => p.status === s).length}</button>`).join('')}</div>`
    + (shown.length ? shown.map((p) => `<div class="item pj"><div class="row"><div class="grow">
        <div class="meta"><span class="badge">${esc(p.type)}</span><span class="badge" style="--c:${stColor[p.status] || '#868e96'}">${esc(p.status)}</span></div>
        <div class="nm" style="margin-top:4px">${esc(p.name)}</div>
        <div class="meta" style="margin-top:3px">${esc(p.schedule)}</div></div></div>
        <div class="more"><p class="meta" style="line-height:1.55">${esc(p.desc)}</p>
          <div class="meta">지나는 곳: ${esc((p.regions || []).map((r) => r.filter(Boolean).join(' ')).join(', '))}</div>
          ${p.source ? `<a class="btn sm" style="margin-top:8px" href="${esc(p.source.url)}" target="_blank" rel="noopener">출처: ${esc(p.source.title)} (${esc(p.source.date || '')})</a>` : ''}</div></div>`).join('')
      : `<div class="empty">${esc(scopeLabel(sc))}에 등록된 개발호재가 없어요</div>`)
    + `<div class="note">${esc(P.note)} (기준 ${esc(P.asOf)})</div>`;
}
