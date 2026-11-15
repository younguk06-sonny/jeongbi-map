/* 정비맵 — 공유(글귀 남겨 카카오톡 등으로 보내기), 처음 쓰는 사람용 사용 방법, 휴대폰 뒤로 가기 종료 확인 */
'use strict';

const APP_URL = 'https://younguk06-sonny.github.io/jeongbi-map/';

// ---------- 공유 ----------
function shareDefaultText() {
  const s = S.sel;
  if (s && !s.zone && !s.sale && !s.cx) {
    const sm = typeof summary === 'function' ? summary() : null;
    const nb = typeof NB !== 'undefined' && NB.data?.site === s && NB.data.list ? NB.data.list.length : null;
    const bits = [
      nb != null ? `주변 정비사업 ${nb}건(반경 ${fmtR(settings.radius)})` : '',
      sm?.all ? `평균 평당 ${fmtN(sm.all.v)}만원(전용·${sm.all.c}개 단지)` : '',
    ].filter(Boolean).join(' · ');
    return `[정비맵] ${s.name} 주변 정비사업·시세·청약\n${s.sgg} ${s.dong}${bits ? '\n' + bits : ''}\n아래 링크를 누르면 같은 화면으로 바로 열려요.`;
  }
  if (s) return `[정비맵] ${s.name}\n지도에서 주변 시세·청약·정비사업을 같이 볼 수 있어요.`;
  return '[정비맵] 정비사업장 주변 정비사업·아파트 시세·청약 일정을 지도에서 한눈에 확인해 보세요.';
}
function shareUrl() {
  const s = S.sel;
  return s && !s.zone && !s.sale && !s.cx ? `${APP_URL}#site=${encodeURIComponent(s.id)}` : APP_URL;
}
function openShare() {
  const url = shareUrl();
  openModal(`<h3>📤 공유하기</h3>
    <p class="meta" style="margin:-4px 0 10px">보낼 글귀를 적고 <b>카카오톡으로 보내기</b>를 누르세요. 링크를 받은 사람은 ${S.sel && url !== APP_URL ? '같은 사업장 화면으로' : '정비맵 첫 화면으로'} 바로 열려요.</p>
    <textarea class="input sh-msg" id="shMsg" rows="5">${esc(shareDefaultText())}</textarea>
    <div class="sh-url"><span>🔗</span><span class="grow">${esc(url)}</span></div>
    <div class="btns sh-btns">
      <button class="btn p" id="shGo">💬 카카오톡으로 보내기</button>
      <button class="btn" id="shCopy">글귀+링크 복사</button>
    </div>
    <div class="meta">휴대폰에서는 공유 창이 열리면 <b>카카오톡</b>을 고르면 돼요. PC에서는 복사해서 카카오톡 대화창에 붙여 넣으세요.</div>`);
  const msg = () => $('#shMsg').value.trim();
  const copy = () => {
    const t = `${msg()}\n${url}`;
    (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('복사했어요 — 카카오톡에 붙여 넣으세요'), () => { $('#shMsg').value = t; $('#shMsg').select(); toast('글귀를 길게 눌러 복사해 주세요'); });
  };
  $('#shCopy').onclick = copy;
  $('#shGo').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: '정비맵', text: msg(), url }); closeModal(); }
      catch (e) { if (e.name !== 'AbortError') copy(); }
    } else copy();
  };
  setTimeout(() => { const t = $('#shMsg'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 60);
}

// ---------- 사용 방법 ----------
function openGuide(first) {
  openModal(`<div class="gd">
    <div class="gd-top"><img src="icons/icon-192.png" alt=""><div><h3>정비맵 사용 방법</h3><p class="meta">정비사업장 주변의 경쟁 정비사업·시세·청약·공급을 사업심의 전에 빠르게 확인해요</p></div></div>
    <ol class="gd-steps">
      <li><b>🏗️ 사업장 고르기</b><span>지도 위 <em>당사 사업장</em> 탭을 눌러 사업장을 고르면 상세 화면이 열려요. (PC는 오른쪽, 휴대폰은 아래)</span></li>
      <li><b>🗺️ 주변 정비사업</b><span>반경(500m~3km)을 바꾸면 목록과 지도 번호가 같이 바뀌어요. 행을 누르면 지도에서 강조되고, 펼치면 출처별 단계와 원문 링크가 보여요.</span></li>
      <li><b>💰 시세·분양 카드</b><span>상단의 평당가 카드를 누르면 어떤 단지·거래로 계산했는지(기간·반경·표본 수) 확인할 수 있어요.</span></li>
      <li><b>📢 청약·공급</b><span>민영·공공·임대·잔여세대로 걸러 보고, 본건 예상 분양월을 넣으면 전후 12개월에 겹치는 분양을 보여줘요.</span></li>
      <li><b>🗂️ 지도 상단 탭</b><span><em>정비구역</em>(사업유형·진행단계 필터, ON/OFF), <em>분양</em>, <em>실거래가·매매가·전세가</em>를 지도에 겹쳐 볼 수 있어요.</span></li>
      <li><b>🔍 왼쪽 창</b><span>시도·시군구를 고르거나 구역·단지를 검색하고, 아래 <em>지역 세부내용</em>에서 실거래·미분양·인허가·청약 흐름을 봐요.</span></li>
      <li><b>📤 공유</b><span>위쪽 공유 버튼으로 글귀를 적어 카카오톡으로 보내면 받는 사람도 같은 사업장 화면으로 바로 열려요.</span></li>
    </ol>
    <div class="note">모든 수치는 공개 자료(국토부 실거래가, 청약홈, 서울시·경기도·국토부 정비구역 등) 기준이고, 화면마다 출처와 기준일을 적어 두었어요. 직접 입력한 분양가·내부 자료는 이 기기에만 저장돼요.</div>
    <div class="btns"><button class="btn p" id="gdOk" style="flex:1;justify-content:center">${first ? '시작하기' : '닫기'}</button></div>
    ${first ? '<div class="meta" style="text-align:center;margin-top:6px">⚙️ 설정에서 언제든 다시 볼 수 있어요</div>' : ''}</div>`);
  $('#gdOk').onclick = () => { LS.set('guided', true); closeModal(); };
}

// ---------- 휴대폰 뒤로 가기 ----------
// 열린 창(확인 창 → 안내·설정 창 → 왼쪽 창 → 상단 패널 → 펼친 상세 → 선택한 사업장)부터 하나씩 닫고, 다 닫힌 첫 화면에서만 '종료하시겠습니까?'
const BK = { guard: false, exiting: false, ignoreHash: false };
const BK_ON = matchMedia('(pointer: coarse)').matches || matchMedia('(display-mode: standalone)').matches;
function bkUrl() { const s = S.sel; return s && !s.zone && !s.sale && !s.cx ? '#site=' + encodeURIComponent(s.id) : location.pathname; }
function ensureGuard(url) { if (BK_ON && !BK.guard) { try { history.pushState({ g: 1 }, '', url || bkUrl()); BK.guard = true; } catch (e) { /* */ } } }
const exitOpen = () => $('#exitDlg').classList.contains('on');
function showExit() { $('#exitDlg').classList.add('on'); setTimeout(() => $('#exNo').focus(), 50); }
function hideExit() { $('#exitDlg').classList.remove('on'); }
function bkStep() {
  if (exitOpen()) return hideExit();
  if ($('#modal').classList.contains('on')) return closeModal();
  if ($('#drawer').classList.contains('on')) return openDrawer(false);
  if ($('#fpanel').classList.contains('on')) return openTab(null);
  const sh = $('#sheet');
  if (S.sel && (sh.classList.contains('open') || sh.classList.contains('full')) && innerWidth < 900) return setSheet('show');
  if (S.sel) return closeSite();
  showExit();
}
function bkInit() {
  if (!BK_ON) return;
  addEventListener('popstate', () => {
    BK.guard = false;
    if (BK.exiting) return;
    BK.ignoreHash = true; setTimeout(() => (BK.ignoreHash = false), 300); // 뒤로 가기로 바뀐 주소(#site=)가 다른 사업장을 열지 않게
    bkStep();
    ensureGuard(); // 항상 한 칸 남겨 두어 바로 꺼지지 않게
  });
  $('#exNo').onclick = hideExit;
  $('#exitDlg').addEventListener('click', (e) => { if (e.target.id === 'exitDlg') hideExit(); });
  $('#exYes').onclick = () => {
    hideExit(); BK.exiting = true;
    try { window.close(); } catch (e) { /* */ } // 홈 화면 앱이면 여기서 닫힘
    setTimeout(() => { // 브라우저 탭이면 남겨 둔 칸을 지워 다음 뒤로 가기에 종료되게
      history.back();
      setTimeout(() => { BK.exiting = false; toast('뒤로 가기를 한 번 더 누르면 종료돼요'); setTimeout(() => { if (!document.hidden) ensureGuard(); }, 3000); }, 400);
    }, 150);
  };
  ensureGuard(location.href); // 처음엔 지금 주소 그대로(공유 링크 #site= 유지)
}

function uxInit() {
  $('#btnShare')?.addEventListener('click', openShare);
  bkInit();
  if (!LS.get('guided', false)) setTimeout(() => openGuide(true), 700);
}
