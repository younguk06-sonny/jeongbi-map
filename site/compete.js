/* 정비맵 — 분양 경쟁 비교 (기존 자료로 뒷받침되는 범위만)
   - 본건 예상 분양월(브라우저에만 저장) 전후 12개월에 겹치는 공고 확정 분양과, 분양월 미확인 정비사업을 나눠 보여줌
   - 일정 근거: 공고 확정(청약홈 입주자모집공고) / 공개 계획 / 추정 / 미확인 — 단계만 보고 분양월·물량을 만들지 않음
   - 주택형별(59·74·84·대형) 본건 예정 분양가 총액 vs 비교 사례 총액 차이·차이율, 표 복사 */
'use strict';

const CP = { db: LS.get('planMonth', {}) }; // { siteId: 'YYYY-MM' }
const CP_BASIS = { notice: ['공고 확정', '#2b8a3e'], plan: ['공개 계획', '#1c7ed6'], est: ['추정', '#e67700'], unk: ['미확인', '#868e96'] };
const cpTag = (k) => `<span class="cp-b" style="--c:${CP_BASIS[k][1]}">${CP_BASIS[k][0]}</span>`;
const ymAdd = (ym, m) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const genOf = (it) => (it.comp && it.comp.supply != null ? { v: it.comp.supply, l: '일반공급' } : it.types?.length ? { v: it.types.reduce((a, t) => a + (t[3] || 0), 0), l: '일반+특별' } : null);

function compHTML(sm) {
  const s = S.sel; if (!s || s.zone || s.sale || s.cx) return '';
  const pm = CP.db[s.id] || '';
  const notices = sm.chs.filter((it) => chKindOf(it) !== 'rent' && it.rcept);
  const head = `<div class="cp"><div class="cp-h"><b>⚔️ 분양 경쟁 비교</b><span class="meta">반경 ${fmtR(settings.chRadius)}(청약) · ${fmtR(settings.radius)}(정비사업)</span></div>
    <label class="cp-in">본건 예상 분양월 <input type="month" class="input" data-cpm="1" value="${esc(pm)}"><small>이 기기에만 저장 · 공개 데이터에 넣지 않아요</small></label>`;
  // 정비사업: 분양월 자료가 없으므로 미확인으로만 (관리처분·착공 단계는 분양이 가까울 수 있어 따로 표시)
  const nb = (typeof NB !== 'undefined' && NB.data?.site === s && NB.data.list) ? NB.data.list : null;
  const late = nb ? nb.filter((g) => ['mgmt', 'build', 'impl'].includes(Z_STAGES[g.rank]?.[0])) : [];
  const nbBlock = !nb ? '<div class="meta">주변 정비사업을 불러오는 중…</div>'
    : `<div class="cp-sec">주변 정비사업 · 분양월 ${cpTag('unk')}</div>
      ${late.length ? `<table class="cp-t"><thead><tr><th>사업</th><th>공개자료상 단계</th><th>일반분양 예정</th><th>분양월</th></tr></thead><tbody>${late.map((g) => `<tr><td>${esc(g.name)}<small>${fmtDist(g.dist)}</small></td><td>${esc(g.stage)}</td><td class="num">${g.gen != null ? fmtN(g.gen) + '세대' : '<span class="unk">미확인</span>'}</td><td>${cpTag('unk')}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="meta">${late.length ? `사업시행·관리처분·착공 단계 ${late.length}곳` : '사업시행인가 이후 단계 사업 없음'} · 반경 안 전체 ${nb.length}곳. 공개자료에 분양 예정월이 없어 겹침 계산에 넣지 않았어요(단계로 분양월을 추정하지 않음).</div>`;
  if (!pm) {
    const up = notices.filter((it) => it.winner >= TODAY);
    return head + `<div class="meta cp-hint">예상 분양월을 넣으면 전후 12개월 안에 공고된 분양과 일반분양 물량을 계산해요. 지금 접수 예정·진행 중인 공고 ${up.length}건.</div>${nbBlock}</div>`;
  }
  const from = ymAdd(pm, -12), to = ymAdd(pm, 12);
  const hit = notices.filter((it) => it.rcept.slice(0, 7) >= from && it.rcept.slice(0, 7) <= to).sort((a, b) => a.rcept.localeCompare(b.rcept));
  const sumGen = hit.reduce((a, it) => a + (genOf(it)?.v || 0), 0), sumTot = hit.reduce((a, it) => a + (it.total || 0), 0);
  const before = hit.filter((it) => it.rcept.slice(0, 7) < pm).length, after = hit.length - before;
  return head + `<div class="cp-sum">${from.replace('-', '.')} ~ ${to.replace('-', '.')} · 공고 확정 <b>${hit.length}건</b> (본건 전 ${before} · 후 ${after}) · 일반분양 <b>${fmtN(sumGen)}세대</b> <span class="meta">(총 공급 ${fmtN(sumTot)}세대)</span></div>
    ${hit.length ? `<table class="cp-t"><thead><tr><th>단지</th><th>접수</th><th>본건 대비</th><th>일반분양</th><th>근거</th></tr></thead><tbody>${hit.map((it) => {
      const diff = (+it.rcept.slice(0, 4) - +pm.slice(0, 4)) * 12 + (+it.rcept.slice(5, 7) - +pm.slice(5, 7)); const g = genOf(it);
      return `<tr><td>${esc(it.name)}<small>${esc(it.kind || '')} · ${fmtDist(it.d)}</small></td><td class="num">${fmtDate(it.rcept)}</td><td class="num">${diff === 0 ? '같은 달' : diff > 0 ? diff + '개월 후' : -diff + '개월 전'}</td><td class="num">${g ? fmtN(g.v) + `<small>${g.l}</small>` : '<span class="unk">미확인</span>'}</td><td>${cpTag('notice')}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="meta">전후 12개월 안에 공고된 분양이 없어요. (아직 공고 전인 사업은 자료에 없어요)</div>'}
    ${nbBlock}
    <div class="meta">공고 확정: 청약홈 입주자모집공고(접수일 기준, 임대 제외). 일반분양은 단지 경쟁률 자료의 일반공급 세대, 없으면 주택형별 일반+특별 합계로 표시해요.</div></div>`;
}
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-cpm]'); if (!t || !S.sel) return;
  if (t.value) CP.db[S.sel.id] = t.value; else delete CP.db[S.sel.id];
  LS.set('planMonth', CP.db); renderSheetBody();
});

// ---------- 주택형별 총액 비교 (분양가 적정성 패널 아래) ----------
const TY_B = [['59', '전용 59㎡대', 55, 65], ['74', '전용 74㎡대', 70, 79], ['84', '전용 84㎡대', 80, 90], ['L', '전용 95㎡ 이상', 95, 999]];
const tyOf = (a) => (TY_B.find(([, , lo, hi]) => a >= lo && a < hi) || [])[0];
function pcTypeHTML(s) {
  if (s.zone || s.sale || s.cx) return '';
  const an = S.an; if (!an || !an.cx || !an.ch) return '';
  const sm = summary(); if (!sm) return '';
  const v = (PC.db[s.id] || {}).t || {};
  // 비교 사례: 최근 분양(공고 확정, 임대 제외) 주택형별 최고 분양가 / 반경 안 실거래(보관된 개별 거래, 12개월)
  const cases = [];
  for (const { it } of sm.saleUsed) for (const t of it.types || []) { const k = tyOf(t[0]); if (k && t[2]) cases.push({ k, name: it.name, kind: '분양', area: t[0], amt: t[2], date: it.date, src: '청약홈 입주자모집공고', d: it.d }); }
  const to = S.meta?.tradeTo || NOW_YM;
  const f = new Date(+to.slice(0, 4), +to.slice(4, 6) - 12, 1), fs = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}`;
  for (const r of sm.inR) for (const d of r.deals || []) { const k = tyOf(d[1]); if (k && d[0].slice(0, 6) >= fs) cases.push({ k, name: r.apt, kind: '실거래', area: d[1], amt: d[3], date: `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`, src: '국토부 실거래가', d: r.d, floor: d[2] }); }
  const rows = TY_B.map(([k, l]) => {
    const mine = +v[k] || null, cs = cases.filter((c) => c.k === k).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    return { k, l, mine, cs };
  });
  const diff = (m, a) => (m && a ? { d: m - a, p: (m / a - 1) * 100 } : null);
  const body = rows.map(({ k, l, mine, cs }) => `<tr class="ty-h"><td colspan="6"><b>${l}</b> · 본건 예정 총액 <input class="input ty-in" type="number" inputmode="numeric" min="0" step="100" data-pct="${k}" value="${mine || ''}" placeholder="만원"> <small>만원</small></td></tr>
    ${cs.length ? cs.map((c) => { const x = diff(mine, c.amt); return `<tr><td>${esc(c.name)}<small>${c.kind} · 전용 ${c.area}㎡${c.floor != null ? ` · ${c.floor}층` : ''} · ${fmtDist(c.d)}</small></td><td class="num">${fmtEok(c.amt)}</td><td class="num">${esc(c.date.slice(2).replace(/-/g, '.'))}</td><td>${esc(c.src)}</td><td class="num ${x ? (x.d >= 0 ? 'up' : 'dn') : ''}">${x ? (x.d >= 0 ? '+' : '') + fmtEok(Math.abs(x.d)).replace(/^/, x.d < 0 ? '-' : '') : '–'}</td><td class="num ${x ? (x.d >= 0 ? 'up' : 'dn') : ''}">${x ? (x.p >= 0 ? '+' : '') + x.p.toFixed(1) + '%' : '–'}</td></tr>`; }).join('') : '<tr><td colspan="6" class="meta">같은 주택형 비교 사례 없음</td></tr>'}`).join('');
  return `<div class="pc ty" id="tyBox"><div class="pc-head"><b>📐 주택형별 총액 비교</b><button class="btn sm" data-tycopy="1">표 복사</button></div>
    <table class="ty-t"><thead><tr><th>비교 사례</th><th>총액</th><th>기준일</th><th>출처</th><th>차이</th><th>차이율</th></tr></thead><tbody>${body}</tbody></table>
    <div class="note">비교 사례: 반경 ${fmtR(settings.chRadius)} 최근 분양(공고일 ${SALE_FROM.replace(/-/g, '.')} 이후, 임대 제외)의 주택형별 최고 분양가, 반경 ${fmtR(settings.radius)} 실거래 중 원자료에 보관된 개별 거래(${tradeWindow()}). 차이 = 본건 − 사례, 차이율 = 본건 ÷ 사례 − 1. 본건 금액은 이 기기에만 저장돼요.</div></div>`;
}
function tyCopy() {
  const s = S.sel, v = (PC.db[s.id] || {}).t || {};
  const box = $('#tyBox'); if (!box) return;
  const lines = [['주택형', '본건 예정 총액(만원)', '비교 사례', '구분', '전용㎡', '사례 총액(만원)', '기준일', '출처', '차이(만원)', '차이율(%)'].join('\t')];
  const sm = summary(); const to = S.meta?.tradeTo || NOW_YM; const f = new Date(+to.slice(0, 4), +to.slice(4, 6) - 12, 1), fs = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}`;
  for (const [k, l] of TY_B) {
    const mine = +v[k] || '';
    const cs = [];
    for (const { it } of sm.saleUsed) for (const t of it.types || []) if (tyOf(t[0]) === k && t[2]) cs.push([it.name, '분양', t[0], t[2], it.date, '청약홈 입주자모집공고']);
    for (const r of sm.inR) for (const d of r.deals || []) if (tyOf(d[1]) === k && d[0].slice(0, 6) >= fs) cs.push([r.apt, '실거래', d[1], d[3], `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`, '국토부 실거래가']);
    cs.sort((a, b) => b[4].localeCompare(a[4]));
    for (const c of cs.slice(0, 8)) lines.push([l, mine, c[0], c[1], c[2], c[3], c[4], c[5], mine ? mine - c[3] : '', mine ? ((mine / c[3] - 1) * 100).toFixed(1) : ''].join('\t'));
  }
  lines.push(`기준: ${s.name} · 반경 분양 ${fmtR(settings.chRadius)} / 실거래 ${fmtR(settings.radius)} · 작성 ${TODAY}`);
  const txt = lines.join('\n');
  (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('표를 복사했어요 — 엑셀에 붙여 넣으세요'), () => { openModal(`<h3>표 복사</h3><textarea class="input" style="width:100%;height:240px">${esc(txt)}</textarea><div class="btns"><button class="btn" onclick="closeModal()">닫기</button></div>`); });
}
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-pct]'); if (!t || !S.sel) return;
  const o = PC.db[S.sel.id] || {}; o.t = o.t || {};
  const n = parseFloat(t.value); if (n > 0) o.t[t.dataset.pct] = n; else delete o.t[t.dataset.pct];
  PC.db[S.sel.id] = o; LS.set('planPrice', PC.db);
  const box = $('#tyBox'); if (box) box.outerHTML = pcTypeHTML(S.sel);
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-tycopy]')) tyCopy(); });
