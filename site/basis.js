/* 정비맵 — 대표값 집계 근거, 진행 단계 출처, 청약 유형 필터·주택형 상세
   대표값(summary)과 같은 계산 결과를 그대로 펼쳐 보여줘서 표본 수가 항상 맞게 함 */
'use strict';

// ---------- 시세·분양 대표값 근거 ----------
function openBasis(key) {
  const an = S.an;
  if (!an || !an.cx) return toast(an?.err ? '주변 자료 조회에 실패했어요' : '주변 자료를 불러오는 중이에요');
  const sm = summary(), s = S.sel;
  if (key === 'sale') return openModal(basisSaleHTML(sm, s));
  const o = key === 'nw' ? sm.nw : sm.all, pool = key === 'nw' ? sm.nwArr : sm.inR;
  const title = key === 'nw' ? `${fmtR(settings.radius)} 안 10년 이내 단지 평당가` : `${fmtR(settings.radius)} 안 평균 평당가`;
  const inWin = (d) => { const to = S.meta?.tradeTo; if (!to) return true; const f = new Date(+to.slice(0, 4), +to.slice(4, 6) - 12, 1); const fs = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}`; return d.slice(0, 6) >= fs && d.slice(0, 6) <= to; };
  const used = (o?.used || []).slice().sort((a, b) => b.n12 - a.n12);
  const rows = used.map((r) => {
    const deals = (r.deals || []).filter((d) => inWin(d[0]));
    return `<tr><td><b>${esc(r.apt)}</b><small>${esc(r.dong)} · ${r.by ? r.by + '년' : '준공 미상'}</small></td><td class="num">${fmtDist(r.d)}</td><td class="num">${r.n12}건</td><td class="num">${fmtN(r.py12)}</td><td class="num">${(r.n12 / o.n * 100).toFixed(1)}%</td></tr>
      ${deals.length ? `<tr class="bs-deal"><td colspan="5">${deals.map((d) => `<span>${d[0].slice(2, 4)}.${d[0].slice(4, 6)}.${d[0].slice(6, 8)} · 전용 ${d[1]}㎡ · ${d[2] ?? '-'}층 · ${fmtEok(d[3])}</span>`).join('')}</td></tr>` : ''}`;
  }).join('');
  const noTrade = pool.filter((r) => !(r.py12 && r.n12));
  const old = key === 'nw' ? sm.inR.filter((r) => !(r.by && THIS_YEAR - r.by <= 10)) : [];
  const miss = an.missingList || [];
  openModal(`<div class="bs">
    <h3>${title}</h3>
    <div class="bs-v"><b class="num">${o ? fmtN(o.v) + '만/평' : '자료 없음'}</b><span>${s ? esc(s.name) + ' 기준 · ' : ''}${tradeWindow()} · ${o ? `${o.c}개 단지 · 거래 ${fmtN(o.n)}건` : '거래 0건'}</span></div>
    <div class="bs-f"><b>산식</b> Σ(단지 12개월 평당가 × 단지 12개월 거래건수) ÷ Σ거래건수<br>
      단지 12개월 평당가 = 월별 단지 전용 ㎡당 중위가를 거래건수로 가중평균 × 3.3058 (전용면적 기준)<br>
      범위: 사업장 위치에서 단지 위치(카카오 검색)까지 직선 ${fmtR(settings.radius)} 이내${key === 'nw' ? `, 준공 ${THIS_YEAR - 10}년 이후` : ''} · 자료: 국토교통부 아파트 매매 실거래가</div>
    ${used.length ? `<table class="bs-t"><thead><tr><th>포함 단지</th><th>거리</th><th>거래</th><th>평당(만)</th><th>가중치</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td></td><td class="num">${fmtN(o.n)}건</td><td class="num">${fmtN(o.v)}</td><td class="num">100%</td></tr></tfoot></table>
      <div class="meta">개별 거래(거래일·전용·층·금액)는 원자료에서 지역 상위 단지만 보관돼 일부 단지에만 보여요.</div>` : '<div class="empty">집계에 들어간 단지가 없어요.</div>'}
    ${noTrade.length || old.length || miss.length ? `<div class="bs-x"><b>집계에서 빠진 단지</b>
      ${noTrade.map((r) => `<div>${esc(r.apt)} <span class="meta">· 반경 안 · 최근 12개월 거래 없음${r.n36 ? ` (36개월 ${r.n36}건)` : ''}</span></div>`).join('')}
      ${old.length ? `<div>${old.length}개 단지 <span class="meta">· 준공 10년 초과 또는 준공연도 미상 (${esc(old.slice(0, 4).map((r) => r.apt).join(', '))}${old.length > 4 ? ' 등' : ''})</span></div>` : ''}
      ${miss.slice(0, 30).map((r) => `<div>${esc(r.apt)} <span class="meta">· ${esc(r.dong)} · 지도에서 위치를 찾지 못해 반경 판단 불가</span></div>`).join('')}${miss.length > 30 ? `<div class="meta">외 ${miss.length - 30}곳</div>` : ''}
    </div>` : ''}
    <div class="btns"><button class="btn" onclick="closeModal()">닫기</button></div></div>`);
}

function basisSaleHTML(sm, s) {
  const rows = sm.saleUsed.slice().sort((a, b) => b.it.date.localeCompare(a.it.date)).map(({ it, s: v }) => `<tr><td><b>${esc(it.name)}</b><small>${esc(it.kind || '')}</small></td><td class="num">${fmtDate(it.date)}</td><td class="num">${fmtDist(it.d)}</td><td class="num">${fmtN(v.n)}</td><td class="num">${fmtN(v.v)}</td></tr>`).join('');
  return `<div class="bs">
    <h3>최근 분양 평당가 (${fmtR(settings.chRadius)})</h3>
    <div class="bs-v"><b class="num">${sm.sale ? fmtN(sm.sale) + '만/평' : '자료 없음'}</b><span>${s ? esc(s.name) + ' 기준 · ' : ''}${sm.saleUsed.length}개 단지 · ${fmtN(sm.saleN)}세대 가중</span></div>
    <div class="bs-f"><b>산식</b> 단지별 Σ(주택형 최고 분양가 ÷ 전용면적 × 3.3058 × 주택형 세대수) ÷ Σ세대수 → 전체도 세대수로 가중평균<br>
      기간: 입주자모집공고일 ${SALE_FROM.replace(/-/g, '.')} 이후 · 범위: 공고 주소 위치까지 직선 ${fmtR(settings.chRadius)} 이내<br>
      포함: 민영 분양주택, 국민(공공) 분양주택 · <b>제외: 임대(분양전환 가능 임대 포함)</b> · 세대수는 주택형별 일반+특별공급<br>
      잔여세대·무순위 공고는 청약홈 APT 분양정보 자료에 없어 이 값에 들어 있지 않아요. 평당가는 <b>전용면적 기준</b>(공급면적 기준보다 큼).</div>
    ${rows ? `<table class="bs-t"><thead><tr><th>포함 단지</th><th>공고일</th><th>거리</th><th>세대(가중)</th><th>평당(만)</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td></td><td></td><td class="num">${fmtN(sm.saleN)}</td><td class="num">${fmtN(sm.sale)}</td></tr></tfoot></table>` : '<div class="empty">기간·반경 안에 집계할 분양 단지가 없어요.</div>'}
    ${sm.saleRent.length || sm.saleNoType.length ? `<div class="bs-x"><b>집계에서 빠진 공고</b>
      ${sm.saleRent.map((it) => `<div>${esc(it.name)} <span class="meta">· ${esc(it.kind)} · 임대라서 제외</span></div>`).join('')}
      ${sm.saleNoType.map((it) => `<div>${esc(it.name)} <span class="meta">· 주택형별 분양가 자료 없음</span></div>`).join('')}</div>` : ''}
    <div class="btns"><button class="btn" onclick="closeModal()">닫기</button></div></div>`;
}

// ---------- 당사 사업장 진행 단계: 출처별 ----------
function builderHTML(b) {
  if (!b) return '<span class="unk">미확인</span>';
  const m = String(b).match(/^(.*?)\s*\((.*?)\)\s*$/);
  const name = m ? m[1] : b, st = m ? m[2] : '';
  return `${esc(name)} <span class="bst ${st ? '' : 'unk'}">${st ? '선정 상태: ' + esc(st) : '선정 상태 미확인'}</span>`;
}
function stageSourcesHTML(s) {
  const o = typeof nbOursSources === 'function' ? nbOursSources(s) : { state: 'error', msg: '' };
  const asOf = (S.sitesAsOf || '').replace('-', '.');
  const item = (cls, lbl, stage, meta, url) => `<div class="stg-i"><div class="stg-l"><span class="nb-k ${cls}">${lbl}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">원문 ↗</a>` : ''}</div><b>${esc(stage)}</b><div class="meta">${meta}</div></div>`;
  let pub = '';
  if (o.state === 'loading') pub = '<div class="meta stg-load">공개자료를 찾는 중…</div>';
  else if (o.state === 'error') pub = `<div class="meta stg-load">공개자료 조회 실패${o.msg ? ' · ' + esc(o.msg) : ''}</div>`;
  else {
    const one = (e) => { const sr = nbSrc(e.src, e.z); return item(e.kind === 'plan' ? 'plan' : '', e.kind === 'plan' ? '별도 기획 이력' : '공개자료상 인허가 단계', e.stage, `${esc(sr.l)}${sr.d ? ` · 자료 기준 ${esc(sr.d)}` : ''}${e.date ? ` · ${esc(e.dateL || '일자')} ${esc(ymd(e.date))}` : ''} · ${esc(e.type)}`, sr.url); };
    pub = (o.permit.length ? o.permit.map(one).join('') : item('', '공개자료상 인허가 단계', '미확인', '공개 정비구역 자료에서 이 사업장 구역을 찾지 못했어요.', ''))
      + (o.plan.length ? o.plan.map(one).join('') : '');
  }
  return `<div class="stg3"><div class="stg-h">진행 단계 · 출처별</div>
    ${item('ours', '당사 진행 현황', s.stage || '미확인', `당사 사업장 정보(공개 범위 요약) · 기준 ${esc(asOf || '미확인')}`, '')}
    ${pub}
    <div class="meta stg-n">출처마다 기준일과 단계 구분이 달라 하나로 합치지 않았어요.</div></div>`;
}

// ---------- 청약 유형 필터 ----------
const CHK = { on: Object.assign({ pri: 1, pub: 1, rent: 1, rem: 1 }, LS.get('chKinds', {})) };
function chFilterHTML(list) {
  const cnt = (k) => list.filter((it) => chKindOf(it) === k).length;
  return `<div class="seg chk"><span class="lbl">유형</span>${CH_KINDS.map(([k, l]) => {
    const n = k === 'rem' ? 0 : cnt(k);
    return `<button data-chk="${k}" class="${CHK.on[k] && k !== 'rem' ? 'on' : ''}" ${k === 'rem' ? 'disabled title="잔여세대·무순위 공고는 수집 자료에 없어요"' : ''}>${l} <small>${k === 'rem' ? '자료 없음' : n}</small></button>`;
  }).join('')}</div>`;
}
const chPass = (it) => !!CHK.on[chKindOf(it)];
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-chk]'); if (!b || b.disabled) return;
  CHK.on[b.dataset.chk] = CHK.on[b.dataset.chk] ? 0 : 1; LS.set('chKinds', CHK.on);
  if (S.sel) renderSheetBody();
});

// 주택형별 표 (공급 세대수 = 일반+특별, 신청건수는 단지 합계만 보관됨)
function chTypesHTML(it) {
  const ty = (it.types || []).slice().sort((a, b) => a[0] - b[0]);
  const c = it.comp;
  if (!ty.length && !c) return '';
  return `${ty.length ? `<table class="ch-ty num"><thead><tr><th>전용㎡</th><th>공급㎡</th><th>최고 분양가</th><th>전용 평당</th><th>세대(일반+특별)</th></tr></thead><tbody>
    ${ty.map((t) => `<tr><td>${t[0]}</td><td>${t[1] ?? '–'}</td><td>${t[2] ? fmtEok(t[2]) : '–'}</td><td>${t[0] && t[2] ? fmtN(t[2] / (t[0] / 3.3058)) + '만' : '–'}</td><td>${t[3] ?? '–'}</td></tr>`).join('')}</tbody></table>` : ''}
    ${c ? `<div class="meta">일반공급 ${fmtN(c.supply)}세대 · 1순위 신청 ${fmtN(c.r1)}건 · 2순위 신청 ${fmtN(c.r2)}건${c.avg1 != null ? ` · 1순위 평균 ${c.avg1}:1` : ''}${c.shortUnits ? ` · 미달 ${fmtN(c.shortUnits)}세대` : ''} <span class="unk">주택형별 신청건수 미보관</span></div>` : '<div class="meta">경쟁률 자료 없음</div>'}`;
}
