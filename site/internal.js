/* 정비맵 — 내부 자료 겹쳐보기 (이 기기에서만)
   엑셀·CSV를 브라우저 안에서만 읽어 당사 사업장에 붙여 보여줍니다. 파일 내용은 어디로도 전송되지 않아요.
   (엑셀을 읽을 때 SheetJS 프로그램만 cdnjs에서 내려받고, 자료는 내려받은 프로그램이 이 기기 안에서 읽습니다.)
   기본은 이 창을 닫으면 사라지고, '이 기기에 기억'을 켜면 이 브라우저 저장소에만 남깁니다. */
'use strict';

const IN = { rows: null, cols: [], nameCol: 0, match: {}, unmatched: [], file: '', tagCol: LS.get('inTag', ''), keep: false };
const IN_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

(function inRestore() {
  const v = LS.get('internal', null);
  if (v && v.rows) { Object.assign(IN, v, { keep: true }); }
})();
function inInitAfterSites() { if (IN.rows) { inMatch(); inTagMarkers(); } }

// ---------- 읽기 ----------
function inPick() {
  const f = document.createElement('input');
  f.type = 'file'; f.accept = '.xlsx,.xls,.xlsm,.csv,.txt';
  f.onchange = () => f.files[0] && inRead(f.files[0]);
  f.click();
}
async function inRead(file) {
  try {
    let table;
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = IN_XLSX; s.onload = ok; s.onerror = () => no(new Error('엑셀 읽기 프로그램을 불러오지 못했어요. 인터넷 연결을 확인하거나 CSV로 저장해 올려 주세요.')); document.head.appendChild(s); });
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      // 사업장 이름 열이 있는 첫 시트
      for (const sn of wb.SheetNames) {
        const t = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
        if (inHeader(t) >= 0) { table = t; break; }
      }
      table ||= XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    } else {
      const buf = await file.arrayBuffer();
      let txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('euc-kr').decode(buf); // 엑셀에서 저장한 CSV(한글 윈도우)
      table = inCSV(txt);
    }
    const h = inHeader(table);
    if (h < 0) throw new Error('사업장 이름 열(사업장·구역·사업명·현장)을 찾지 못했어요. 첫 줄에 열 이름을 넣어 주세요.');
    const cols = table[h].map((c) => String(c).trim());
    const nameCol = cols.findIndex((c) => /사업장|구역명|사업명|현장|^구역$|^사업$/.test(c));
    IN.cols = cols; IN.nameCol = nameCol;
    IN.rows = table.slice(h + 1).filter((r) => String(r[nameCol] || '').trim()).map((r) => cols.map((_, i) => String(r[i] ?? '').trim()));
    IN.file = file.name;
    if (!IN.cols.includes(IN.tagCol)) IN.tagCol = IN.cols.find((c) => /등급/.test(c)) || '';
    inMatch(); inSave(); inTagMarkers();
    renderChips(); if (S.sel) renderSheetBody();
    toast(`내부 자료 ${IN.rows.length}행 중 ${Object.keys(IN.match).length}곳을 사업장에 연결했어요`);
    if (IN.unmatched.length) inShowUnmatched();
  } catch (e) { console.warn(e); toast(e.message || '파일을 읽지 못했어요'); }
}
function inHeader(t) {
  for (let i = 0; i < Math.min(15, t.length); i++) if ((t[i] || []).some((c) => /사업장|구역명|사업명|현장|^구역$/.test(String(c).trim()))) return i;
  return -1;
}
function inCSV(txt) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

// ---------- 사업장 연결 ----------
const inNorm = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s|주택|재개발|재건축|정비사업|정비구역|사업|조합|아파트|일원|지구|단지|-/g, '').replace(/구역$/, '').toLowerCase();
function inMatch() {
  IN.match = {}; IN.unmatched = [];
  if (!IN.rows) return;
  const sites = S.sites.map((s) => ({ s, k: inNorm(s.name), k2: inNorm(s.short || '') }));
  for (const r of IN.rows) {
    const k = inNorm(r[IN.nameCol]);
    if (!k) continue;
    const hit = sites.find((x) => x.k === k) || sites.find((x) => x.k && (x.k.includes(k) || k.includes(x.k))) || sites.find((x) => x.k2 && (k.includes(x.k2) || x.k2.includes(k)));
    if (hit && !IN.match[hit.s.id]) IN.match[hit.s.id] = r; else if (!hit) IN.unmatched.push(r[IN.nameCol]);
  }
}
function inSave() {
  if (IN.keep) LS.set('internal', { rows: IN.rows, cols: IN.cols, nameCol: IN.nameCol, file: IN.file, tagCol: IN.tagCol });
  else { try { localStorage.removeItem('jm_internal'); } catch (e) { /* */ } }
}
function inClear() {
  Object.assign(IN, { rows: null, cols: [], match: {}, unmatched: [], file: '', keep: false });
  inSave(); inTagMarkers(); renderChips(); if (S.sel) renderSheetBody();
  toast('내부 자료를 지웠어요');
}
const inRow = (s) => IN.match[s.id] || null;

// 예정 분양가(공급 3.3㎡당 만원) — 분양가 비교에서 기본값으로
function inPlanPrice(s) {
  const r = inRow(s); if (!r) return null;
  const i = IN.cols.findIndex((c) => /분양가/.test(c) && !/총|합계|세대당/.test(c)); if (i < 0) return null;
  let v = parseFloat(String(r[i]).replace(/[^0-9.]/g, '')); if (!v) return null;
  if (v > 1e6) v /= 1e4; // 원 단위로 적은 경우
  return v >= 300 && v <= 30000 ? v : null;
}

// ---------- 화면 ----------
function inTagMarkers() {
  for (const s of S.sites) {
    const m = S.siteMarks[s.id]; if (!m) continue;
    m.el.querySelector('.in-tag')?.remove();
    const r = inRow(s), i = IN.cols.indexOf(IN.tagCol);
    if (r && i >= 0 && r[i]) { const t = document.createElement('sup'); t.className = 'in-tag'; t.textContent = r[i]; m.el.appendChild(t); }
  }
}
function inPanelHTML() {
  if (!IN.rows) return `<div class="in-bar"><span>🔒 <b>내부 자료 겹쳐보기</b><small>엑셀·CSV를 이 기기에서만 읽어 사업장에 붙여요. 어디로도 전송되지 않아요.</small></span>
    <span class="in-btns"><button class="btn sm" data-in="tpl">양식 받기</button><button class="btn sm p" data-in="pick">📎 파일 불러오기</button></span></div>`;
  const n = Object.keys(IN.match).length;
  return `<div class="in-bar on"><span>🔒 <b>${esc(IN.file)}</b><small>${n}곳 연결${IN.unmatched.length ? ` · <a href="#" data-in="un">${IN.unmatched.length}행 미연결</a>` : ''} · 이 기기에서만</small></span>
    <span class="in-btns">
      <label class="in-sel">지도 표시 <select data-in="tag"><option value="">없음</option>${IN.cols.filter((c, i) => i !== IN.nameCol).map((c) => `<option ${c === IN.tagCol ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="in-keep"><input type="checkbox" data-in="keep" ${IN.keep ? 'checked' : ''}> 이 기기에 기억</label>
      <button class="btn sm" data-in="pick">바꾸기</button><button class="btn sm" data-in="clear">지우기</button></span></div>`;
}
function inPanelClick(e) {
  const b = e.target.closest('[data-in]'); if (!b || b.tagName === 'SELECT' || b.type === 'checkbox') return false;
  e.preventDefault();
  const a = b.dataset.in;
  if (a === 'pick') inPick(); else if (a === 'clear') inClear(); else if (a === 'tpl') inTemplate(); else if (a === 'un') inShowUnmatched();
  return true;
}
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-in]'); if (!t) return;
  if (t.dataset.in === 'tag') { IN.tagCol = t.value; LS.set('inTag', IN.tagCol); inSave(); inTagMarkers(); }
  if (t.dataset.in === 'keep') {
    IN.keep = t.checked; inSave();
    toast(IN.keep ? '이 브라우저에 저장했어요 — 공용 PC에서는 끄세요' : '저장된 내부 자료를 지웠어요 (이 창을 닫으면 사라져요)');
  }
});
function inShowUnmatched() {
  openModal(`<h3>사업장과 연결 못 한 행</h3><p class="meta">이름이 지도 속 사업장 이름과 달라 연결하지 못했어요. 파일의 사업장명을 아래 이름 중 하나로 맞추면 연결돼요.</p>
    <div class="in-un"><div><b>파일 속 이름</b>${IN.unmatched.map((n) => `<div>${esc(n)}</div>`).join('')}</div><div><b>지도 속 사업장</b>${S.sites.filter((s) => !IN.match[s.id]).map((s) => `<div>${esc(s.name)}</div>`).join('')}</div></div>
    <div class="btns"><button class="btn" onclick="closeModal()">닫기</button></div>`);
}
function inTemplate() {
  const head = ['사업장명', '위험등급', '비례율(%)', '예정분양가(공급3.3㎡당 만원)', '메모'];
  const csv = '﻿' + [head, ...S.sites.map((s) => [s.name, '', '', '', ''])].map((r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = '정비맵_내부자료_양식.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function inSiteHTML(s) {
  if (s.zone || s.sale || s.cx) return '';
  const r = inRow(s);
  if (!r) return IN.rows ? '<div class="in-card none">🔒 불러온 내부 자료에 이 사업장 행이 없어요</div>' : '';
  const items = IN.cols.map((c, i) => [c, r[i]]).filter(([c, v], i) => i !== IN.nameCol && v);
  return `<div class="in-card"><div class="in-h">🔒 내부 자료 <small>${esc(IN.file)} · 이 기기에서만 보여요</small></div>
    <dl class="dl">${items.map(([c, v]) => `<dt>${esc(c)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
}
