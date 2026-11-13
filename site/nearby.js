/* 정비맵 — 당사 사업장 '주변 정비사업' 탭
   - 반경(500m~3km, 시세 탭과 같은 반경) 안 정비구역을 구역 중심까지 직선거리로 모아 표/목록으로 보여줌
   - 같은 구역이 여러 출처(서울플랜+ 인허가·신통 기획, 국토부 경계, 경기도 추진현황, 1기 신도시 기본계획)에 있으면 한 행으로 묶음
   - 지도 정비구역 필터(사업유형·진행단계)를 그대로 씀. 이 탭을 보는 동안 지도에는 목록에 있는 구역만 그림
   - 당사 사업장 구역은 기준점으로 따로 보여주고 건수에서 뺌 */
'use strict';

const NB = { data: null, sort: LS.get('nbSort', 'dist'), n: 0, active: false, ids: new Set(), hlIds: new Set(), hl: null, marks: [], busy: false };
const NB_SORTS = [['dist', '거리순'], ['stage', '단계순'], ['hh', '계획 세대수순']];
const NB_PLAN_T = new Set(['BZ101']); // 별도 기획 이력으로 보는 사업유형 (신속통합기획)

// 출처 정보 (기준일은 자료 파일에 적힌 값)
function nbSrc(code, z) {
  const ym = (t) => ((t || '').match(/(\d{4})\.(\d{2})/) || []).slice(1).join('.') || '';
  if (code === 'S') return { l: '서울시 도시계획사업(서울플랜+)', short: '서울플랜+', d: ym(Z.meta.src.S), url: 'https://cleanup.seoul.go.kr/' };
  if (code === 'N') return { l: '국토교통부 연속주제 정비구역', short: '국토부', d: ym(Z.meta.src.N), url: 'https://www.data.go.kr/data/15146864/fileData.do' };
  if (code === 'G') return { l: '경기도 일반 정비사업 추진현황', short: '경기도', d: ym(Z.meta.src.G) || '2025.10', url: 'https://www.data.go.kr/data/15119846/fileData.do' };
  if (code === 'T') return { l: z?.nt?.city.plan || '노후계획도시정비기본계획', short: '1기 신도시 기본계획', d: '', url: z?.nt?.city.url || '' };
  return { l: code, short: code, d: '', url: '' };
}
const ymd = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d && d.length === 4 ? `${d}년` : d || '');

// 한 구역 레코드 → 출처별 항목
function nbEntries(z) {
  const out = [];
  const plan = NB_PLAN_T.has(z.t);
  if (z.id[0] === 'S') out.push({ src: 'S', kind: plan ? 'plan' : 'permit', type: zTypeName(z), stage: zStage(z), date: z.d && z.d <= TODAY.replace(/-/g, '') ? z.d : '', dateL: '자료 작성일', z });
  else if (z.id[0] === 'N') {
    out.push({ src: 'N', kind: 'permit', type: zTypeName(z), stage: z.s0 || (z.gg ? '정비구역 지정' : zStage(z)), date: z.d || '', dateL: '고시', z });
    if (z.gg) out.push({ src: 'G', kind: 'permit', type: z.gg.ty || zTypeName(z), stage: z.gg.st, date: z.gg.dt?.length ? z.gg.dt[z.gg.dt.length - 1][1] : '', dateL: '최근 인가·고시', gg: z.gg, z });
  } else if (z.id[0] === 'G') out.push({ src: 'G', kind: 'permit', type: z.gg.ty || '-', stage: z.gg.st, date: z.gg.dt?.length ? z.gg.dt[z.gg.dt.length - 1][1] : '', dateL: '최근 인가·고시', gg: z.gg, approx: true, z });
  else if (z.id[0] === 'T') out.push({ src: 'T', kind: 'permit', type: '노후계획도시 정비', stage: zStage(z), date: '', note: z.nt.z.note || '', approx: true, z });
  return out;
}

const nbNorm = (s) => String(s || '').replace(/\(.*?\)/g, '').replace(/\s|주택|재개발|재건축|정비사업|정비구역|정비|사업|구역|지구|아파트|일원|\(가칭\)|-/g, '').replace(/[ⅠⅡⅢ]/g, (c) => ({ Ⅰ: '1', Ⅱ: '2', Ⅲ: '3' }[c])).toLowerCase();
const stageRank = (z) => Z_STAGES.findIndex(([k]) => k === zBucket(z));

function pointInPoly(p, path) { // path: [[위도, 경도], ...]
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const [yi, xi] = path[i], [yj, xj] = path[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 같은 구역 묶기: 이름이 같고 가까우면(300m), 이름이 없거나 다르면 중심이 아주 가깝고 면적이 비슷할 때
function nbSame(a, b) {
  const d = dist(a.c, b.c), na = nbNorm(a.n), nb = nbNorm(b.n);
  if (na && nb && na.length >= 2 && na === nb && d < 300) return true;
  const ra = Math.min(a.a, b.a) / Math.max(a.a, b.a || 1);
  return d < Math.max(40, Math.sqrt(Math.min(a.a, b.a)) * 0.25) && ra > 0.6;
}

async function nbCompute(s) {
  const n = ++NB.n, p = sitePoint(s), R = settings.radius;
  NB.data = { site: s, R, loading: true };
  nbRender();
  for (let i = 0; i < 60 && !Z.inited; i++) await new Promise((r) => setTimeout(r, 200)); // 공유 링크로 바로 열 때 정비구역 자료를 기다림
  if (n !== NB.n) return;
  if (!Z.inited) { NB.data = { site: s, R, error: '정비구역 자료를 불러오지 못했어요.' }; return nbRender(); }
  nbRender();
  try {
    const kLat = (R + 400) / 111320, kLng = (R + 400) / (111320 * Math.cos(p.lat * Math.PI / 180));
    const bb = [p.lat - kLat, p.lng - kLng, p.lat + kLat, p.lng + kLng];
    const codes = Object.keys(Z.meta.sgg).filter((k) => bbHit(Z.meta.sgg[k].bb, bb));
    const lists = await Promise.all(codes.map(loadZoneFile));
    if (typeof ggZonesReady === 'function') lists.push(await ggZonesReady(codes));
    if (typeof ntZonesNear === 'function') lists.push(await ntZonesNear(bb));
    if (n !== NB.n) return;
    const all = lists.flat().filter((z) => z.c && dist(p, z.c) <= R + Math.sqrt(z.a || 0) + 300);
    // 묶기 (union-find)
    const par = all.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (nbSame(all[i], all[j])) par[f(i)] = f(j);
    const gm = new Map(); all.forEach((z, i) => { const r = f(i); if (!gm.has(r)) gm.set(r, []); gm.get(r).push(z); });
    // 당사 구역 판별: 사업장 경계 안에 중심이 있거나, 경계가 없으면 150m 안 + 이름 일치
    const path = areaPath(s), sn = nbNorm(s.name);
    const isOurs = (z) => (path ? pointInPoly(z.c, path) : dist(p, z.c) < 150) || (sn && nbNorm(z.n) && (nbNorm(z.n) === sn || nbNorm(z.n).includes(sn) || sn.includes(nbNorm(z.n))) && dist(p, z.c) < 600);
    const groups = [...gm.values()].map((zs) => nbGroup(zs, p));
    const ours = groups.filter((g) => g.zs.some(isOurs));
    const cand = groups.filter((g) => !ours.includes(g) && g.dist <= R);
    const pass = (g) => g.zs.some((z) => Z.on[z.k] && Z.stOn[zBucket(z)]);
    const list = cand.filter(pass);
    NB.data = { site: s, R, list, ours, hidden: cand.length - list.length, at: Date.now() };
    nbSortList();
    nbApplyMap();
    nbRender();
  } catch (e) {
    console.error(e);
    if (n === NB.n) { NB.data = { site: s, R, error: '주변 정비구역을 조회하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; nbRender(); }
  }
}

function nbGroup(zs, p) {
  const entries = zs.flatMap(nbEntries);
  const permit = entries.filter((e) => e.kind === 'permit'), plan = entries.filter((e) => e.kind === 'plan');
  // 공개자료상 인허가 단계: 가장 진행된 단계 (같은 출처끼리 다르면 각각 보여줌)
  const prim = (permit.length ? permit : plan).slice().sort((a, b) => stageRank(b.z) - stageRank(a.z) || (b.date || '').localeCompare(a.date || ''))[0];
  const z0 = prim.z;
  const names = zs.map((z) => z.n).filter(Boolean).sort((a, b) => a.length - b.length);
  const gg = entries.find((e) => e.gg)?.gg;
  const num = (v) => (v == null || v === '' ? null : +String(v).replace(/[^0-9.]/g, ''));
  const srcDates = [...new Set(entries.map((e) => e.src))].map((c) => ({ c, ...nbSrc(c, zs.find((z) => z.id[0] === c) || z0) }));
  const latest = entries.map((e) => e.date).filter((d) => d && d.length === 8).sort().pop();
  return {
    id: z0.id, zs, z0, name: zTitle(Object.assign({}, z0, { n: names.find((x) => nbNorm(x)) || z0.n })),
    type: prim.type, dist: Math.min(...zs.map((z) => dist(p, z.c))), entries, permit, plan, prim,
    stage: prim.stage, rank: stageRank(z0), hh: gg ? num(gg.hh) : null, gen: gg ? num(gg.gen) : null, hasGG: !!gg,
    latest, srcDates, approx: zs.every((z) => z.approx),
  };
}

function nbSortList() {
  const L = NB.data?.list; if (!L) return;
  const k = NB.sort;
  L.sort((a, b) => k === 'stage' ? b.rank - a.rank || a.dist - b.dist
    : k === 'hh' ? (b.hh ?? -1) - (a.hh ?? -1) || a.dist - b.dist
      : a.dist - b.dist);
  L.forEach((g, i) => (g.no = i + 1));
}

// ---------- 지도 ----------
function nbActive() { return !!(S.sel && !S.sel.zone && !S.sel.sale && !S.sel.cx && S.sheetTab === 'near' && NB.data?.list && NB.data.site === S.sel); }
function nbApplyMap() {
  const on = nbActive();
  NB.active = on;
  NB.ids = new Set(on ? [...NB.data.list, ...NB.data.ours].flatMap((g) => g.zs.map((z) => z.id)) : []);
  NB.marks.forEach((m) => m.ov.setMap(null)); NB.marks = [];
  if (on && S.map) {
    for (const g of NB.data.list) {
      const el = document.createElement('button');
      el.className = 'nb-pin' + (NB.hl === g.id ? ' on' : ''); el.textContent = g.no; el.title = g.name;
      el.onclick = (e) => { e.stopPropagation(); nbFocus(g.id, true); };
      const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(g.z0.c.lat, g.z0.c.lng), content: el, yAnchor: 1.6, zIndex: 9 });
      ov.setMap(S.map); NB.marks.push({ ov, el, g: g.id });
    }
  }
  if (!on) nbClearHl();
  if (typeof zonesRefresh === 'function') zonesRefresh();
}
function nbClearHl() {
  const old = [...NB.hlIds]; NB.hlIds = new Set(); NB.hl = null;
  old.forEach((id) => restyleZone(id, false));
}
function nbFocus(gid, fromMap) {
  const g = NB.data?.list?.find((x) => x.id === gid) || NB.data?.ours?.find((x) => x.id === gid); if (!g) return;
  nbClearHl();
  NB.hl = gid; NB.hlIds = new Set(g.zs.map((z) => z.id));
  g.zs.forEach((z) => { if (Z.polys[z.id]) restyleZone(z.id, true); });
  NB.marks.forEach((m) => m.el.classList.toggle('on', m.g === gid));
  $$('#shBody [data-nb], #drSite [data-nb]').forEach((r) => r.classList.toggle('on', r.dataset.nb === gid));
  if (fromMap) {
    if (S.sheetTab !== 'near') { S.sheetTab = 'near'; renderSheet(); }
    setSheet(innerWidth >= 900 ? 'show' : 'open');
    $$('#shBody [data-nb].open, #shBody .nb-more.open').forEach((x) => x.classList.remove('open'));
    $(`#shBody [data-nbmore="${CSS.escape(gid)}"]`)?.classList.add('open');
    const row = $(`#shBody .nb-${innerWidth >= 900 ? 'wide' : 'narrow'} [data-nb="${CSS.escape(gid)}"]`);
    if (row) { row.classList.add('open', 'on'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  } else {
    if (innerWidth < 900) setSheet('show'); // 휴대폰: 지도를 보이게 내림
    const c = g.z0.c; S.map.panTo(new kakao.maps.LatLng(c.lat - (innerWidth >= 900 ? 0 : (S.map.getBounds().getNorthEast().getLat() - S.map.getBounds().getSouthWest().getLat()) * 0.18), c.lng));
  }
}
function nbMapClick(z) { // 지도에서 구역을 누르면 목록의 해당 행으로
  if (!NB.active) return false;
  const g = [...NB.data.list, ...NB.data.ours].find((x) => x.zs.some((y) => y.id === z.id)); if (!g) return false;
  if (NB.data.ours.includes(g)) { S.sheetTab = 'near'; renderSheet(); setSheet('open'); $('#shBody .nb-ref')?.scrollIntoView({ block: 'start' }); return true; }
  nbFocus(g.id, true); return true;
}
function nbRefresh() { if (S.sel && !S.sel.zone && !S.sel.sale && !S.sel.cx) nbCompute(S.sel); }

// ---------- 화면 ----------
const nbUnk = '<span class="unk">미확인</span>';
const nbHH = (v) => (v == null ? nbUnk : `${fmtN(v)}세대`);
function nbStageCell(g) {
  const permitSrc = [...new Set(g.permit.map((e) => e.src))];
  const diff = new Set(g.permit.map((e) => e.stage)).size > 1;
  return `<b>${esc(g.stage)}</b><small>${esc(nbSrc(g.prim.src, g.prim.z).short)}${diff ? ` 외 ${permitSrc.length - 1}개 출처` : ''}${g.plan.length ? ` · 기획: ${esc(g.plan[0].stage)}` : ''}</small>`;
}
function nbDateCell(g) {
  const s = g.srcDates.map((x) => x.d).filter(Boolean).sort().pop();
  return s ? `<b>${esc(s.slice(2))}</b><small>${esc(g.srcDates.find((x) => x.d === s).short)} 기준</small>` : nbUnk;
}
function nbSourcesHTML(g) {
  return `<div class="nb-srcs">${g.entries.map((e) => {
    const sr = nbSrc(e.src, e.z);
    return `<div class="nb-src">
      <div class="nb-src-h"><span class="nb-k ${e.kind}">${e.kind === 'plan' ? '별도 기획 이력' : '공개자료상 인허가 단계'}</span>${sr.url ? `<a href="${esc(sr.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ''}</div>
      <div><b>${esc(e.stage)}</b> <span class="meta">· ${esc(e.type)}</span></div>
      <div class="meta">${esc(sr.l)}${sr.d ? ` · 자료 기준 ${esc(sr.d)}` : ''}${e.date ? ` · ${esc(e.dateL || '일자')} ${esc(ymd(e.date))}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}${e.approx ? ' · 경계 대략 표시' : ''}</div>
      ${e.gg?.dt?.length ? `<div class="meta nb-dt">${e.gg.dt.map(([l, d]) => `${esc(l)} ${esc(ymd(d))}`).join(' → ')}</div>` : ''}
    </div>`;
  }).join('')}
  <div class="btns"><button class="btn sm" data-nbzone="${esc(g.id)}">구역 상세 열기</button></div></div>`;
}

function nbBodyHTML() {
  const d = NB.data, s = S.sel;
  const head = `<div class="tools">
      <div class="seg"><span class="lbl">반경</span>${RADII.map((r) => `<button data-r="${r}" class="${r === settings.radius ? 'on' : ''}">${fmtR(r)}</button>`).join('')}</div>
      <div class="seg"><span class="lbl">정렬</span>${NB_SORTS.map(([k, l]) => `<button data-nbsort="${k}" class="${k === NB.sort ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>`;
  const nCat = Z.meta ? Z.meta.cats.filter(([k]) => Z.on[k]).length : 0, nSt = Z_STAGES.filter(([k]) => Z.stOn[k]).length;
  const flt = Z.meta ? `<div class="nb-flt">필터 · 사업유형 ${nCat}/${Z.meta.cats.length} · 진행단계 ${nSt}/${Z_STAGES.length}${Z.stOn.done ? '' : ' (준공 제외)'} <button class="lnk" data-nbflt="1">지도 필터에서 바꾸기</button></div>` : '';
  if (!d || d.site !== s || d.loading) return head + flt + '<div class="nb-state">⏳ 주변 정비구역을 찾는 중이에요…</div>';
  if (d.error) return head + `<div class="nb-state err">⚠️ ${esc(d.error)}</div>`;
  const ref = `<div class="nb-ref" data-nbref="1"><div class="nb-ref-h">📍 기준점 · <b>${esc(s.name)}</b> <span class="meta">(당사 사업장 · 건수 제외)</span></div>
    ${d.ours.length ? d.ours.map((g) => `<div class="nb-ref-r"><span>공개자료: <b>${esc(g.stage)}</b> <small>${esc(nbSrc(g.prim.src, g.prim.z).short)}</small>${g.plan.length ? ` · 기획: ${esc(g.plan.map((e) => e.stage).join(', '))}` : ''}</span></div>`).join('') : '<div class="meta">공개 정비구역 자료에서 이 사업장 구역을 찾지 못했어요.</div>'}
    <div class="meta">당사 진행 현황: <b>${esc(s.stage || '미확인')}</b> · 자세한 출처는 개요 탭</div></div>`;
  const cnt = `<div class="nb-cnt">반경 <b>${fmtR(d.R)}</b> 안 주변 정비사업 <b>${d.list.length}건</b><span class="meta"> · 구역 중심까지 직선거리${d.hidden ? ` · 필터로 숨긴 ${d.hidden}건` : ''}</span></div>`;
  if (!d.list.length) return head + flt + ref + cnt + `<div class="empty">반경 안에 조건에 맞는 정비구역이 없어요.${d.hidden ? '<br>지도 필터에서 사업유형·단계를 더 켜 보세요.' : '<br>반경을 넓혀 보세요.'}</div>`;
  const rows = d.list.map((g) => `<tr data-nb="${esc(g.id)}" class="${NB.hl === g.id ? 'on' : ''}">
      <td class="no"><i style="--c:${zColor(g.z0)}">${g.no}</i></td>
      <td class="nm"><b>${esc(g.name)}</b>${g.zs.length > 1 || g.entries.length > 1 ? `<small>${g.entries.length}개 출처 묶음</small>` : ''}${g.approx ? '<small>경계 대략</small>' : ''}</td>
      <td>${esc(g.type)}</td><td class="num">${fmtDist(g.dist)}</td>
      <td class="st">${nbStageCell(g)}</td>
      <td class="num">${nbHH(g.hh)}</td><td class="num">${nbHH(g.gen)}</td><td class="dt">${nbDateCell(g)}</td></tr>
      <tr class="nb-more" data-nbmore="${esc(g.id)}"><td colspan="8">${nbSourcesHTML(g)}</td></tr>`).join('');
  const table = `<table class="nb-tbl"><thead><tr><th>#</th><th>구역명</th><th>사업유형</th><th>거리</th><th>공개자료상 단계</th><th>계획 세대수</th><th>일반분양 예정</th><th>최신 확인일</th></tr></thead><tbody>${rows}</tbody></table>`;
  const cards = d.list.map((g) => `<div class="nb-card ${NB.hl === g.id ? 'on' : ''}" data-nb="${esc(g.id)}">
      <div class="nb-c1"><i style="--c:${zColor(g.z0)}">${g.no}</i><b>${esc(g.name)}</b><span class="num">${fmtDist(g.dist)}</span></div>
      <div class="nb-c2"><span class="badge" style="--c:${zColor(g.z0)}">${esc(g.type)}</span>${nbStageCell(g)}</div>
      <div class="nb-c3">계획 ${nbHH(g.hh)} · 일반분양 ${nbHH(g.gen)} · 확인 ${nbDateCell(g).replace(/<small>.*?<\/small>/, '').replace(/<\/?b>/g, '')}</div>
      <div class="more">${nbSourcesHTML(g)}</div></div>`).join('');
  return head + flt + ref + cnt + `<div class="nb-wide">${table}</div><div class="nb-narrow">${cards}</div>
    <div class="note">공개자료상 단계는 묶인 출처 중 가장 진행된 단계예요. 출처마다 기준일이 달라 실제 진행과 차이가 날 수 있어요. 계획 세대수·일반분양 예정은 경기도 추진현황에만 있어 나머지는 <b>미확인</b>으로 표시해요(0세대와 구분). 행을 누르면 출처별 단계와 원문 링크가 열려요.</div>`;
}

function nbBind(body) {
  body.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('a')) return;
    const so = t.closest('[data-nbsort]'); if (so) { NB.sort = so.dataset.nbsort; LS.set('nbSort', NB.sort); nbSortList(); nbApplyMap(); renderSheetBody(); return true; }
    if (t.closest('[data-nbflt]')) { openTab('zones'); return; }
    const zb = t.closest('[data-nbzone]'); if (zb) { const g = NB.data.list.find((x) => x.id === zb.dataset.nbzone); if (g) selectZone(g.z0); return; }
    if (t.closest('[data-nbref]')) { S.sheetTab = 'info'; renderSheet(); return; }
    const r = t.closest('[data-nb]'); if (!r || t.closest('.nb-more,.more .btns')) return;
    const id = r.dataset.nb, wasOpen = r.classList.contains('open');
    $$('#shBody [data-nb].open').forEach((x) => x.classList.remove('open'));
    $$('#shBody .nb-more.open').forEach((x) => x.classList.remove('open'));
    if (!wasOpen) { r.classList.add('open'); $(`#shBody [data-nbmore="${CSS.escape(id)}"]`)?.classList.add('open'); }
    nbFocus(id, false);
  });
}

function nbRender() {
  if ((S.sheetTab === 'near' || S.sheetTab === 'info') && S.sel && NB.data?.site === S.sel) { const y = $('#shBody').scrollTop; renderSheetBody(); $('#shBody').scrollTop = y; }
  nbDrawer();
}

// 왼쪽 창: 사업장을 고른 동안 시도 카드보다 먼저
function nbDrawer() {
  const el = $('#drSite'); if (!el) return;
  const s = S.sel, ours = s && !s.zone && !s.sale && !s.cx;
  document.body.classList.toggle('dr-site', !!ours);
  if (!ours) { el.innerHTML = ''; return; }
  const d = NB.data && NB.data.site === s ? NB.data : null;
  const list = d?.list || [];
  el.innerHTML = `<div class="ds-h"><span class="badge" style="--c:${typeColor(s.type)}">${esc(typeShort(s.type))}</span><b>${esc(s.name)}</b><button class="x" data-dsclose="1" title="선택 해제">✕</button></div>
    <div class="meta">${esc(s.sgg)} ${esc(s.dong)} · ${fmtN(s.households)}세대 · 당사: ${esc(s.stage)}</div>
    <div class="ds-cnt">주변 정비사업 <b>${d ? (d.list ? list.length + '건' : '–') : '…'}</b> <span class="meta">반경 ${fmtR(settings.radius)}</span>
      <button class="lnk" data-dsopen="1">표로 보기</button></div>
    <button class="lnk ds-grid" data-dsgrid="1">${document.body.classList.contains('dr-grid') ? '시도 카드 접기 ▴' : '시도 카드 펼치기 ▾'}</button>
    <div class="ds-list">${d?.loading ? '<div class="meta">찾는 중…</div>' : d?.error ? `<div class="meta">${esc(d.error)}</div>` : list.slice(0, 12).map((g) => `<button class="ds-row ${NB.hl === g.id ? 'on' : ''}" data-nb="${esc(g.id)}"><i style="--c:${zColor(g.z0)}">${g.no}</i><span class="grow"><b>${esc(g.name)}</b><small>${esc(g.stage)} · ${fmtDist(g.dist)}</small></span></button>`).join('') + (list.length > 12 ? `<button class="lnk" data-dsopen="1">나머지 ${list.length - 12}건 더 보기</button>` : '')}</div>`;
  el.onclick = (e) => {
    if (e.target.closest('[data-dsclose]')) return closeSite();
    if (e.target.closest('[data-dsgrid]')) { document.body.classList.toggle('dr-grid'); nbDrawer(); return; }
    if (e.target.closest('[data-dsopen]')) { S.sheetTab = 'near'; renderSheet(); setSheet('open'); nbApplyMap(); if (innerWidth < 900) openDrawer(false); return; }
    const r = e.target.closest('[data-nb]'); if (r) { if (S.sheetTab !== 'near') { S.sheetTab = 'near'; renderSheet(); nbApplyMap(); } if (innerWidth < 900) openDrawer(false); nbFocus(r.dataset.nb, false); const row = $(`#shBody [data-nb="${CSS.escape(r.dataset.nb)}"]`); row?.classList.add('open'); $(`#shBody [data-nbmore="${CSS.escape(r.dataset.nb)}"]`)?.classList.add('open'); if (innerWidth >= 900) row?.scrollIntoView({ block: 'center' }); }
  };
}

// 당사 사업장 개요에 쓰는 '진행 단계 출처' (주변 정비사업 계산 결과의 기준점 구역)
function nbOursSources(s) {
  const d = NB.data && NB.data.site === s ? NB.data : null;
  if (!d || d.loading) return { state: 'loading' };
  if (d.error) return { state: 'error', msg: d.error };
  return { state: 'ok', permit: d.ours.flatMap((g) => g.permit), plan: d.ours.flatMap((g) => g.plan) };
}
