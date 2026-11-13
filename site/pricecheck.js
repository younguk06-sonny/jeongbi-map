/* 정비맵 — 분양가 적정성 비교 (당사 사업장)
   예정 분양가(공급면적 3.3㎡당)를 입력하면 전용면적 기준으로 환산해
   주변 신축·10년 이내·구축 실거래 평당가, 최근 분양가와 나란히 비교합니다.
   입력값은 이 기기에만 저장돼요. 내부 자료(internal.js)에 분양가 열이 있으면 기본값으로 씁니다. */
'use strict';

const PC = { db: LS.get('planPrice', {}) }; // { siteId: { p: 공급평당(만원), r: 전용률(%) } }
const PC_RATE = 76; // 아파트 평균 전용률(%) 기본값

function pcGet(s) {
  const v = PC.db[s.id] || {};
  let p = v.p, src = p ? 'me' : '';
  if (!p && typeof inPlanPrice === 'function') { const ip = inPlanPrice(s); if (ip) { p = ip; src = 'in'; } }
  return { p: p || null, r: v.r || PC_RATE, src };
}

function pcRows(s) {
  const sm = summary(); if (!sm) return null;
  const w = (arr) => { let n = 0, t = 0; for (const r of arr) if (r.py12 && r.n12) { n += r.n12; t += r.py12 * r.n12; } return n ? { v: t / n, n, c: arr.filter((r) => r.py12).length } : null; };
  const age = (r) => (r.by ? THIS_YEAR - r.by : 99);
  const n5 = w(sm.inR.filter((r) => age(r) <= 5)), n10 = w(sm.inR.filter((r) => age(r) <= 10)), old = w(sm.inR.filter((r) => age(r) > 10));
  // 최근 3년 분양 (전용·공급 평당 둘 다)
  const recent = sm.chs.filter((it) => it.date >= `${THIS_YEAR - 2}-01-01`);
  let sn = 0, se = 0, ss = 0;
  const list = recent.map((it) => {
    let n = 0, e = 0, g = 0;
    for (const t of it.types || []) if (t[0] && t[2]) { const k = t[3] || 1; n += k; e += (t[2] / (t[0] / 3.3058)) * k; if (t[1]) g += (t[2] / (t[1] / 3.3058)) * k; }
    sn += n; se += e; ss += g;
    return n ? { it, ex: e / n, sup: g ? g / n : null } : null;
  }).filter(Boolean).sort((a, b) => (b.it.date > a.it.date ? 1 : -1));
  const sale = sn ? { v: se / sn, sup: ss ? ss / sn : null, c: list.length } : null;
  return { n5, n10, old, sale, list, R: settings.radius, CR: settings.chRadius };
}

function pcHTML(s) {
  if (s.zone || s.sale || s.cx) return '';
  const an = S.an;
  const { p, r, src } = pcGet(s);
  const head = `<div class="pc-head"><b>💰 분양가 적정성</b><span class="meta">전용면적 3.3㎡당 · 만원</span></div>
    <div class="pc-in">
      <label>예정 분양가 <small>공급 3.3㎡당</small><input class="input" type="number" inputmode="numeric" min="0" step="10" data-pc="p" value="${p ? Math.round(p) : ''}" placeholder="예: 2800"></label>
      <label>전용률 <small>%</small><input class="input" type="number" inputmode="numeric" min="50" max="95" step="1" data-pc="r" value="${r}"></label>
    </div>
    ${src === 'in' ? '<div class="meta pc-src">📎 내부 자료의 분양가를 불러왔어요 (이 기기에서만)</div>' : ''}`;
  if (!an || !an.cx || !an.ch) return `<div class="pc" id="pcBox">${head}<div class="meta">주변 시세를 불러오면 비교가 나와요…</div></div>`;
  const d = pcRows(s);
  const mine = p ? p / (r / 100) : null; // 전용 환산
  const bars = [
    mine && { k: 'me', l: '우리 예정 분양가', sub: `공급 ${fmtN(p)} → 전용 환산`, v: mine },
    d.sale && { k: 'sale', l: `최근 3년 분양 ${fmtR(d.CR)}`, sub: `${d.sale.c}개 단지${d.sale.sup ? ` · 공급 ${fmtN(d.sale.sup)}` : ''}`, v: d.sale.v },
    d.n5 && { k: 'n5', l: `5년 이내 신축 ${fmtR(d.R)}`, sub: `${d.n5.c}개 단지 · ${fmtN(d.n5.n)}건`, v: d.n5.v },
    d.n10 && { k: 'n10', l: `10년 이내 ${fmtR(d.R)}`, sub: `${d.n10.c}개 단지 · ${fmtN(d.n10.n)}건`, v: d.n10.v },
    d.old && { k: 'old', l: `10년 초과 구축 ${fmtR(d.R)}`, sub: `${d.old.c}개 단지 · ${fmtN(d.old.n)}건`, v: d.old.v },
  ].filter(Boolean);
  if (!bars.some((b) => b.k !== 'me')) return `<div class="pc" id="pcBox">${head}<div class="meta">반경 안에 비교할 거래·분양이 없어요. 반경을 넓혀 보세요.</div></div>`;
  const max = Math.max(...bars.map((b) => b.v)) * 1.08;
  const diff = (v) => { if (!mine || !v) return ''; const x = (mine / v - 1) * 100; return `<em class="pc-d ${x >= 0 ? 'up' : 'dn'}">${x >= 0 ? '+' : ''}${x.toFixed(1)}%</em>`; };
  const rows = bars.map((b) => `<div class="pc-row ${b.k === 'me' ? 'me' : ''}" title="${esc(b.l)}: ${fmtN(b.v)}만원">
      <div class="pc-l"><b>${esc(b.l)}</b><small>${esc(b.sub)}</small></div>
      <div class="pc-bar"><i style="width:${(b.v / max * 100).toFixed(1)}%"></i>${mine && b.k !== 'me' ? `<u style="left:${(mine / max * 100).toFixed(1)}%"></u>` : ''}</div>
      <div class="pc-v"><b class="num">${fmtN(b.v)}</b>${b.k === 'me' ? '' : diff(b.v)}</div>
    </div>`).join('');
  const base = d.n5 || d.sale || d.n10;
  let verdict = '';
  if (mine && base) {
    const x = (mine / base.v - 1) * 100, who = base === d.n5 ? '5년 이내 신축 시세' : base === d.sale ? '최근 분양가' : '10년 이내 시세';
    verdict = `<div class="pc-verdict ${x > 10 ? 'hi' : x < -10 ? 'lo' : 'mid'}">예정 분양가가 ${who}보다 <b>${Math.abs(x).toFixed(1)}% ${x >= 0 ? '높아요' : '낮아요'}</b>${x > 10 ? ' — 분양률 민감도에서 하방 시나리오를 함께 보는 게 좋겠어요.' : x < -10 ? ' — 주변 대비 가격 경쟁력이 있는 편이에요.' : ' — 주변 시세와 비슷한 수준이에요.'}</div>`;
  } else if (!mine) verdict = '<div class="meta">예정 분양가를 입력하면 각 기준 대비 몇 % 높은지 바로 보여요.</div>';
  const recent = d.list.slice(0, 4).map((x) => `<li><span>${esc(x.it.name)}</span><small>${esc(x.it.date.slice(0, 7))} · ${fmtR(x.it.d)}</small><b class="num">${fmtN(x.ex)}</b>${diff(x.ex)}</li>`).join('');
  return `<div class="pc" id="pcBox">${head}${verdict}<div class="pc-rows">${rows}</div>
    ${recent ? `<div class="pc-sub">최근 분양 단지 (전용 3.3㎡당, 최고가 기준)</div><ul class="pc-list">${recent}</ul>` : ''}
    <div class="note">실거래는 최근 12개월 전용면적 평당가(거래 가중평균), 분양가는 청약홈 주택형별 최고 분양가를 전용면적으로 나눈 값이에요. 예정 분양가는 입력한 전용률로 전용 기준으로 바꿔 비교해요. 입력값은 이 기기에만 저장돼요.</div></div>`;
}

document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-pc]'); if (!t || !S.sel) return;
  const id = S.sel.id, v = PC.db[id] || {};
  const n = parseFloat(t.value);
  if (t.dataset.pc === 'p') { if (n > 0) v.p = n; else delete v.p; }
  else v.r = n >= 50 && n <= 95 ? n : PC_RATE;
  PC.db[id] = v; LS.set('planPrice', PC.db);
  const box = $('#pcBox'); if (box) box.outerHTML = pcHTML(S.sel);
});
