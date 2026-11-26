/* 나의 농구팀 — 화면 코드 (데이터는 data.js 의 Api 로만 주고받는다) */
(function () {
  'use strict';
  const VERSION = '0.8.0';
  const PRIVACY_URL = 'privacy.html';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = window.Capacitor;
  const platform = cap && cap.getPlatform ? cap.getPlatform() : 'web';
  const isIOS = platform === 'ios' || /[?&]ios=1/.test(location.search);
  const U = Api.util;
  const ROLE = { owner: '대표', admin: '관리자', member: '팀원' };
  const PROVIDER = { kakao: '카카오', google: 'Google', apple: 'Apple', nick: '아이디·비밀번호' };
  const G_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.200 6.900-10.300 6.900-17.700z"/><path fill="#FBBC05" d="M10.500 28.600c-.5-1.400-.8-3-.8-4.600s.3-3.200.8-4.600l-7.900-6.200C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-4.900 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z"/></svg>';
  /* 팀 로고(없으면 팀 이름 첫 글자) */
  const teamAv = (logo, name, cls) => '<div class="av ' + (cls || '') + '">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : initial(name)) + '</div>';
  const kbaChip = (v) => (v === 'yes' ? '<span class="chip blue">협회 등록팀</span>' : '');
  const TEAM_COLORS = ['#ffffff', '#1a1a1a', '#f57c00', '#1565c0']; // 팀별 기본 유니폼색 (A 흰색 → B 검정 → C 주황 → D 파랑)
  const COLOR_PRESET = [['검정', '#1a1a1a'], ['흰색', '#ffffff'], ['주황', '#f57c00'], ['파랑', '#1565c0'], ['빨강', '#c62828'], ['노랑', '#f7d117'], ['초록', '#2e7d32'], ['회색', '#8d8d8d']];
  const Ext = window.AppExt = {}; // 기록 입력·선수 기록 화면(record.js)이 채운다
  const S = { user: null, mems: [], route: { page: 'login' }, stack: [], team: null, cache: {}, loginMode: 'in' };

  /* ---------- 팀 링크 (웹 주소?t=팀ID) ----------
     카톡으로 받은 링크를 열면 로그인(또는 가입) 뒤 그 팀의 참석 화면으로 바로 간다. 팀원이 아니면 팀 소개(가입 신청) 화면 */
  const GO_KEY = 'myhoop.goTeam';
  S.goTeam = (() => {
    let t = '';
    try { t = (new URLSearchParams(location.search).get('t') || '').replace(/[^\w-]/g, '').slice(0, 60); } catch (e) { /* 없음 */ }
    try { if (t) sessionStorage.setItem(GO_KEY, t); else t = sessionStorage.getItem(GO_KEY) || ''; } catch (e) { /* 저장 막힘 */ }
    return t;
  })();
  function takeGoTeam() {
    const t = S.goTeam; S.goTeam = '';
    try { sessionStorage.removeItem(GO_KEY); } catch (e) { /* 무시 */ }
    try { if (/[?&]t=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* 무시 */ }
    return t;
  }
  const goTeamNote = () => (S.goTeam ? '<div class="go-note">' + I.link + '<span><b>팀 링크</b>로 들어왔습니다. 로그인하면 그 팀의 <b>참석 체크</b>가 바로 열립니다.</span></div>' : '');
  const teamLink = (id) => { const w = (window.APP_CONFIG || {}).webUrl; return w ? w + '?t=' + encodeURIComponent(id) : ''; };
  /* 팀 링크 카드 — 앱을 설치하지 않은 팀원도 이 주소로 (PC·폰 브라우저) 참석 체크·기록 확인을 할 수 있다 */
  function teamLinkCard(t, compact) {
    const url = teamLink(t.id);
    if (!url) return '';
    if (compact) return '<button class="btn line block mt12" data-act="shareLink">' + I.link + ' 앱 없는 팀원에게 팀 링크 보내기</button>';
    return '<div class="card"><h2>' + I.link + ' 팀 링크 (카톡 공유용)</h2>' +
      '<p class="muted">앱을 설치하지 않은 팀원도 이 주소를 열면 <b>웹페이지</b>에서 로그인해 참석 체크·현황·기록을 볼 수 있습니다. PC 에서도 열립니다.</p>' +
      '<div class="link-box">' + esc(url) + '</div>' +
      '<div class="row mt8"><button class="btn grow" data-act="shareLink">' + I.chat + ' 카톡 등으로 보내기</button><button class="btn line" data-act="copyLink">주소 복사</button></div></div>';
  }

  /* ---------- 팀 색상 (관리자가 고른 주 색·강조 색으로 앱 색을 바꾼다) ---------- */
  const DEF_THEME = { main: '#1d2b45', accent: '#f26a1b' };
  const THEMES = [['기본 (남색·주황)', '#1d2b45', '#f26a1b'], ['빨강·검정', '#b3202a', '#222222'], ['파랑·하늘', '#1d4f91', '#3fa9f5'], ['초록·노랑', '#1f5f3a', '#e0a800'],
    ['보라·금색', '#4b2a7a', '#d99a1e'], ['검정·빨강', '#1a1a1a', '#e03131'], ['자주·회색', '#7a1f3d', '#6b7280'], ['청록·주황', '#0f5e63', '#f26a1b'],
    ['흰색·남색', '#ffffff', '#1d2b45'], ['흰색·주황', '#ffffff', '#f26a1b']];
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = (h) => { const c = hexRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };
  const darkTo = (h, max) => { let x = h; for (let i = 0; i < 12 && lum(x) > max; i++) x = mixHex(x, '#000000', 0.12); return x; }; // 너무 밝으면 흰 글자가 보이도록 어둡게
  let themeNow = '';
  function applyTheme(th) {
    const key = th ? th.main + th.accent : '';
    if (key === themeNow) return;
    themeNow = key;
    const root = document.documentElement, st = root.style, vars = ['--green', '--green-mid', '--green-light', '--green-stripe', '--accent', '--bar'];
    let main = DEF_THEME.main, bar = main;
    root.classList.remove('bar-light');
    if (!th) vars.forEach((v) => st.removeProperty(v));
    else {
      // 상단 바는 고른 주 색 그대로 칠한다 (흰색도 흰색으로). 밝은 바는 글자를 어둡게(.bar-light),
      // 버튼·표 머리줄처럼 흰 글자가 올라가는 곳은 주 색이 너무 밝으면 강조 색으로 대신 쓴다
      bar = th.main;
      const light = lum(th.main) > 0.55;
      if (light) root.classList.add('bar-light');
      main = darkTo(light ? th.accent : th.main, 0.55);
      st.setProperty('--bar', bar);
      st.setProperty('--green', main); st.setProperty('--green-mid', mixHex(main, '#ffffff', 0.14));
      st.setProperty('--green-light', mixHex(main, '#ffffff', 0.89)); st.setProperty('--green-stripe', mixHex(main, '#ffffff', 0.95));
      st.setProperty('--accent', darkTo(th.accent, 0.68));
    }
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', bar);
  }
  /* 첫 로딩 화면(농구공) 닫기 */
  function hideSplash() {
    const el = document.getElementById('splash');
    if (!el || el.classList.contains('gone')) return;
    el.classList.add('gone'); setTimeout(() => el.remove(), 400);
  }

  /* ---------- 공통 ---------- */
  let toastTimer;
  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show ' + (type || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2200);
  }
  function vibrate(ms) { try { const H = cap && cap.Plugins && cap.Plugins.Haptics; if (H) H.vibrate({ duration: ms || 20 }); } catch (e) { /* 없음 */ } }
  async function run(p, okMsg) {
    try { const v = await p; if (okMsg) toast(okMsg, 'success'); return v; }
    catch (e) { toast(e.message || '오류가 났습니다', 'error'); throw e; }
  }
  function modal(html) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'modal-bg'; bg.id = 'modalBg';
    bg.innerHTML = '<div class="modal" role="dialog">' + html + '</div>';
    bg.addEventListener('click', (e) => { if (e.target === bg && !bg.dataset.lock) closeModal(); });
    document.body.appendChild(bg);
    return bg;
  }
  function closeModal() { const m = $('#modalBg'); if (m) m.remove(); }
  function confirmBox(title, body, okLabel, danger) {
    return new Promise((res) => {
      const bg = modal('<h3>' + esc(title) + '</h3><div class="muted">' + body + '</div><div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn ' + (danger ? 'danger' : '') + '" data-x="1">' + esc(okLabel || '확인') + '</button></div>');
      bg.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { closeModal(); res(b.dataset.x === '1'); }));
    });
  }
  const fmtTime = (ms) => { const d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const initial = (s) => esc(String(s || '?').trim().charAt(0));
  /* ---------- 화면 이동 ---------- */
  function go(route, replace) {
    if (!replace) S.stack.push(S.route);
    S.route = route;
    render();
    window.scrollTo(0, 0);
  }
  function back() {
    if ($('#modalBg')) { closeModal(); return true; }
    if (Ext.back && Ext.back()) return true; // 기록 입력·선수 기록 화면이 떠 있으면 그것부터
    if (S.stack.length) { S.route = S.stack.pop(); render(); return true; }
    return false;
  }
  async function home(replace) {
    S.mems = await Api.myMemberships();
    const act = S.mems.filter((m) => m.status === 'active');
    const p = act.find((m) => m.primary) || act[0];
    S.stack = [];
    if (p) go({ page: 'team', teamId: p.teamId, tab: 'attend' }, true);
    else go({ page: 'explore' }, true);
  }

  /* ---------- 전체 그리기 ---------- */
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq; // 늦게 끝난 이전 화면이 새 화면을 덮어쓰지 않게
    const r = S.route;
    const app = $('#app');
    if (r.page === 'login') { applyTheme(null); app.innerHTML = loginHtml(); hideSplash(); return; }
    let body = '';
    try {
      if (r.page === 'explore') body = await exploreHtml();
      else if (r.page === 'create') body = createHtml();
      else if (r.page === 'me') body = await meHtml();
      else if (r.page === 'team') body = await teamHtml();
    } catch (e) {
      body = barHtml('오류', true) + '<main><div class="card">' + esc(e.message) + '</div></main>';
    }
    if (seq !== renderSeq) return;
    // 팀 화면은 그 팀 색으로 (관리 탭에서 고르는 중인 색이 있으면 그것으로 미리 보기). 다른 화면은 보던 색 그대로
    if (r.page === 'team' && S.team && S.team.id === r.teamId) applyTheme(r.tab === 'admin' && S.cache.themeDraft ? S.cache.themeDraft : S.team.theme);
    app.innerHTML = (Api.mode === 'local' ? '<div class="demo-bar">체험판 · 데이터는 이 기기 안에만 저장됩니다 (서버 연결 전)</div>' : '') + body + navHtml();
    hideSplash();
    afterRender();
  }
  function barHtml(title, showBack, sub, right) {
    return '<header class="appbar">' + (showBack ? '<button class="back" data-act="back" aria-label="뒤로">‹</button>' : '') +
      '<h1>' + esc(title) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</h1>' + (right || '') + '</header>';
  }
  function navHtml() {
    const p = S.route.page;
    const myTeam = p === 'team' && S.mems.some((m) => m.teamId === S.route.teamId && m.status === 'active');
    const item = (act, ic, tx, on) => '<button data-act="' + act + '" class="' + (on ? 'on' : '') + '"><span class="ic">' + ic + '</span>' + tx + '</button>';
    return '<nav class="bottom-nav">' + item('navHome', '' + I.ball + '', '내 팀', myTeam) + item('navExplore', '' + I.search + '', '팀 찾기', p === 'explore' || p === 'create' || (p === 'team' && !myTeam)) + item('navMe', '' + I.user + '', '내 정보', p === 'me') + '</nav>';
  }

  /* =========================================================
   *  로그인
   * ========================================================= */
  function loginHtml() {
    const top = '<div class="login"><div class="logo">' + ballSvg(76) + '</div><h1>나의 농구팀</h1><p class="lead">우리 팀 참석 체크부터 팀 편성·경기 기록까지</p>';
    if (Api.mode === 'server') {
      const up = S.loginMode === 'up';
      return top + goTeamNote() + '<div class="box" style="text-align:left">' + (up ? '<h2 class="lg-hd">' + I.userPlus + ' 새로 가입</h2>' : '') +
        '<label class="f" style="margin-top:0">아이디' + (up ? ' <span class="lg-hint">영문 소문자·숫자 4~20자</span>' : '') + '</label>' +
        '<input class="in" id="lgId" maxlength="20" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="' + (up ? '예: hong77' : '') + '">' +
        '<label class="f">비밀번호 (4자 이상)</label><input class="in" id="lgPw" type="password" maxlength="40" autocomplete="' + (up ? 'new-password' : 'current-password') + '">' +
        (up ? '<label class="f">비밀번호 확인</label><input class="in" id="lgPw2" type="password" maxlength="40" autocomplete="new-password">' +
          '<div class="lg-opt"><div class="lg-opt-hd">기본 정보 <span>(팀에 가입할 때 미리 채워집니다)</span></div>' +
          '<label class="f" style="margin-top:0">이름 (실명) *</label><input class="in" id="lgName" maxlength="20" autocomplete="name" placeholder="예: 홍길동">' +
          '<div class="row"><div class="grow"><label class="f">포지션</label><select class="in" id="lgPos"><option value="">선택</option>' + Api.POSITIONS.map((x) => '<option>' + x + '</option>').join('') + '</select></div>' +
          '<div style="width:80px"><label class="f">등번호</label><input class="in" id="lgNo" inputmode="numeric" maxlength="3"></div>' +
          '<div style="width:92px"><label class="f">출생연도</label><input class="in" id="lgBy" inputmode="numeric" maxlength="4" placeholder="1990"></div></div></div>' +
          '<button class="btn block mt16" data-act="signupNick">가입하기</button><button class="btn gray block mt8" data-act="loginMode" data-v="in">이미 가입했어요 · 로그인</button>'
          : '<button class="btn block mt16" data-act="loginNick">로그인</button><button class="btn line block mt8" data-act="loginMode" data-v="up">새로 가입</button>') +
        '<p class="fine">' + (up ? '로그인은 <b>아이디</b>로 하고, 팀에서는 <b>실명</b>으로 보입니다. 이름이 같은 사람이 있어도 아이디가 다르면 괜찮습니다.' : '처음이면 <b>새로 가입</b>을 누르세요. 0.6.0 이전에 이름으로 가입했다면 그 이름이 아이디입니다.') +
        '<br>시작하면 <a href="' + PRIVACY_URL + '" target="_blank">개인정보처리방침</a>에 동의하는 것으로 봅니다.<br>카카오·Google 로그인은 준비 중입니다.</p></div></div>';
    }
    return top +
      '<div class="box"><button class="btn kakao block" data-act="loginKakao">' + I.chat + ' 카카오로 시작하기</button>' +
      '<button class="btn google block" data-act="loginGoogle">' + G_LOGO + ' Google로 시작하기</button>' +
      (isIOS ? '<button class="btn apple block" data-act="loginApple"> Apple로 계속하기</button>' : '') +
      '<p class="fine" style="margin-top:10px">카카오톡을 쓰지 않아도 Google' + (isIOS ? '·Apple' : '') + ' 계정으로 시작할 수 있습니다.</p>' +
      '<p class="fine">시작하면 <a href="' + PRIVACY_URL + '" target="_blank">개인정보처리방침</a>에 동의하는 것으로 봅니다.<br>' +
      (Api.mode === 'local' ? '지금은 체험판이라 실제 계정 대신 이름으로 들어갑니다.' : '') + '</p></div></div>';
  }
  function ballSvg(sz) {
    // 앱 아이콘과 같은 공 (빛 받은 주황 + 비스듬한 선)
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="lgBall" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="#ffa15c"/><stop offset=".55" stop-color="#f26a1b"/><stop offset="1" stop-color="#c24a0c"/></radialGradient></defs>' +
      '<g transform="rotate(-18 50 50)"><circle cx="50" cy="50" r="45" fill="url(#lgBall)"/><g fill="none" stroke="#141e33" stroke-width="4" stroke-linecap="round"><circle cx="50" cy="50" r="45"/><path d="M50 5V95"/><path d="M5 50H95"/><path d="M19 16C36 32 36 68 19 84"/><path d="M81 16C64 32 64 68 81 84"/></g></g></svg>';
  }
  async function mockLogin(provider) {
    // 체험판: 실제 카카오/애플 로그인 자리. 서버 연결 시 SDK 로그인 결과(사용자 고유번호)로 바꾼다
    const accounts = (await Api.demoAccounts()).filter((a) => a.provider === provider);
    const bg = modal('<h3>' + PROVIDER[provider] + ' 로그인 (체험)' + '</h3>' +
      '<p class="muted">이름을 입력하면 그 이름의 계정으로 들어갑니다. 다른 이름으로 들어가면 다른 사람처럼 가입 신청·수락을 시험할 수 있습니다.</p>' +
      '<label class="f">이름 (실명)</label><input class="in" id="lgNick" maxlength="20" placeholder="예: 홍길동">' +
      (accounts.length ? '<label class="f">예시 계정으로 들어가기</label><div class="pick" id="lgList">' + accounts.slice(0, 30).map((a) => '<button data-nick="' + esc(a.nickname) + '">' + esc(a.nickname) + '</button>').join('') + '</div>' : '') +
      '<div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn" data-x="1">들어가기</button></div>');
    const doIt = async (nick) => { await run(Api.login(provider, nick)); closeModal(); await boot(); };
    bg.querySelector('[data-x="0"]').onclick = closeModal;
    bg.querySelector('[data-x="1"]').onclick = () => doIt($('#lgNick').value);
    $('#lgNick').addEventListener('keydown', (e) => { if (e.key === 'Enter') doIt(e.target.value); });
    bg.querySelectorAll('#lgList button').forEach((b) => (b.onclick = () => doIt(b.dataset.nick)));
    setTimeout(() => $('#lgNick') && $('#lgNick').focus(), 50);
  }

  /* =========================================================
   *  팀 찾기 · 팀 만들기
   * ========================================================= */
  async function exploreHtml() {
    const f = S.cache.ex || (S.cache.ex = { sido: '', q: '' });
    const list = await Api.listTeams(f);
    const stat = { active: '<span class="chip">소속</span>', pending: '<span class="chip orange">승인 대기</span>' };
    return barHtml('팀 찾기', S.stack.length > 0, '지역을 고르고 우리 팀을 찾아 가입하세요', '<button class="ab-btn" data-act="goCreate">+ 팀 만들기</button>') +
      '<main><div class="sido-scroll">' + ['', ...Api.SIDO].map((s) => '<button data-act="exSido" data-v="' + s + '" class="' + (f.sido === s ? 'on' : '') + '">' + (s || '전체') + '</button>').join('') + '</div>' +
      '<input class="in" id="exQ" placeholder="팀 이름·체육관 검색" value="' + esc(f.q) + '" style="margin-bottom:12px">' +
      (list.length ? list.map((t) => '<button class="team-card" data-act="openTeam" data-id="' + t.id + '">' + teamAv(t.logo, t.name) + '<div class="grow"><div class="row" style="flex-wrap:wrap"><span class="nm">' + esc(t.name) + '</span>' + (stat[t.myStatus] || '') + kbaChip(t.kba) + (t.demo ? '<span class="chip gray">예시</span>' : '') + '</div>' +
        '<div class="ds">' + esc(t.sido) + (t.area ? ' · ' + esc(t.area) : '') + ' · 팀원 ' + t.memberCount + '명</div>' + (t.intro ? '<div class="ds">' + esc(t.intro) + '</div>' : '') + '</div></button>').join('')
        : '<div class="card"><p class="empty">' + (f.sido ? esc(f.sido) + ' 지역에 ' : '') + '찾는 팀이 없습니다.</p><button class="btn block mt8" data-act="goCreate">+ 우리 팀 만들기</button></div>') + '</main>';
  }
  /* 농구하는 날: 하루씩 테두리 상자로 나눠 그린다 (머리줄 = 몇 번째 날 · 요일 · 이번 주 날짜) */
  const dayHd = (weekday) => { const v = U.dayView({ weekday: +weekday }); return '<b>' + Api.WEEKDAYS[+weekday] + '요일</b><span class="day-date">이번 주 ' + esc(v.title) + '</span>'; };
  function dayRowsHtml(days) {
    if (!days.length) return '<p class="empty">농구하는 날이 없습니다. 아래 + 요일 추가를 누르세요.</p>';
    return days.map((d, i) => '<div class="day-box" data-day-row="' + i + '"><div class="day-hd"><span class="day-no">' + (i + 1) + '</span><span class="day-when">' + dayHd(d.weekday) + '</span>' +
      '<button class="btn gray sm" data-act="dayDel" data-i="' + i + '" aria-label="이 날 지우기">✕ 지우기</button></div>' +
      '<div class="row"><select class="in" style="width:auto" data-k="weekday">' + Api.WEEKDAYS.map((w, k) => '<option value="' + k + '"' + (+d.weekday === k ? ' selected' : '') + '>' + w + '요일</option>').join('') + '</select>' +
      '<input class="in grow" data-k="place" placeholder="장소 (예: 남산체육관)" value="' + esc(d.place || '') + '"></div>' +
      '<div class="row mt8"><input class="in" style="flex:1 1 0;min-width:0;width:auto" data-k="time" type="time" aria-label="시작 시간" value="' + esc(d.time || '') + '"><span class="muted">~</span>' +
      '<input class="in" style="flex:1 1 0;min-width:0;width:auto" data-k="end" type="time" aria-label="끝나는 시간" value="' + esc(d.end || '') + '"></div>' +
      '<input type="hidden" data-k="id" value="' + esc(d.id || '') + '"></div>').join('');
  }
  function readDays(root) {
    return [...root.querySelectorAll('[data-day-row]')].map((r) => ({ id: r.querySelector('[data-k=id]').value || undefined, weekday: +r.querySelector('[data-k=weekday]').value, time: r.querySelector('[data-k=time]').value, end: r.querySelector('[data-k=end]').value, place: r.querySelector('[data-k=place]').value }));
  }
  function profileFields(p, prefix) {
    // 처음 쓰는 곳(팀 만들기·가입 신청)은 가입할 때 적은 포지션·등번호로 미리 채운다
    p = p || { position: (S.user && S.user.position) || '', number: (S.user && S.user.number) || '', birthYear: (S.user && S.user.birthYear) || '' };
    return '<label class="f">팀에서 쓸 이름 (실명 권장) *</label><input class="in" id="' + prefix + 'Name" maxlength="20" value="' + esc(p.name || (S.user ? S.user.nickname : '')) + '">' +
      '<div class="row"><div class="grow"><label class="f">포지션</label><select class="in" id="' + prefix + 'Pos"><option value="">선택 안 함</option>' + Api.POSITIONS.map((x) => '<option' + (p.position === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div style="width:90px"><label class="f">등번호</label><input class="in" id="' + prefix + 'No" inputmode="numeric" maxlength="3" value="' + esc(p.number || '') + '"></div>' +
      '<div style="width:96px"><label class="f">출생연도</label><input class="in" id="' + prefix + 'By" inputmode="numeric" maxlength="4" placeholder="1990" value="' + esc(p.birthYear || '') + '"></div></div>';
  }
  const readProfile = (prefix) => ({ name: $('#' + prefix + 'Name').value, position: $('#' + prefix + 'Pos').value, number: $('#' + prefix + 'No').value, birthYear: $('#' + prefix + 'By').value });

  /* 팀 로고 고르기. 고른 그림은 작게 줄여 S.cache.logo 에 둔다 (undefined = 안 바꿈) */
  function logoField(cur) {
    return '<label class="f">팀 로고</label><div class="row logo-row"><div class="av lg" id="logoPrev">' + (cur ? '<img src="' + esc(cur) + '" alt="">' : '<span class="muted">없음</span>') + '</div>' +
      '<div class="logo-btns"><label class="btn line sm">그림 고르기<input type="file" accept="image/*" id="logoIn" hidden></label>' +
      '<button class="btn line sm" data-act="logoCrop"' + (cur ? '' : ' hidden') + ' id="logoCropBtn">위치·크기 조정</button><button class="btn gray sm" data-act="logoClear">지우기</button></div></div>' +
      '<p class="muted mt8">로고는 팀 화면 <b>상단 바</b>와 팀 찾기 목록·팀 소개에 보입니다. 그림을 고르면 잘릴 부분과 크기를 직접 맞출 수 있습니다.</p>';
  }
  /* 로고 자르기 창: 그림을 끌어서 위치, 막대(또는 두 손가락·마우스 휠)로 크기. 네모 칸 안이 로고(160px 정사각형)가 된다 */
  function logoCropper(src) {
    const img = new Image();
    img.onload = () => {
      // 아주 큰 사진은 미리 줄여 둔다 (작게 그릴 때 계단 현상·느림 방지)
      let pic = img, W = img.naturalWidth, H = img.naturalHeight;
      if (Math.max(W, H) > 900) { const r = 900 / Math.max(W, H), c0 = document.createElement('canvas'); c0.width = Math.round(W * r); c0.height = Math.round(H * r); c0.getContext('2d').drawImage(img, 0, 0, c0.width, c0.height); pic = c0; W = c0.width; H = c0.height; }
      const V = 220, SV = 280, fit = Math.min(V / W, V / H), cover = Math.max(V / W, V / H);
      const sMin = fit * 0.5, sMax = cover * 4;
      const c = { s: cover, x: 0, y: 0, bg: 'white' }; // x·y = 칸 가운데에서 그림 가운데까지 거리(미리 보기 px)
      const toV = (s) => Math.round(1000 * Math.log(s / sMin) / Math.log(sMax / sMin));
      const bg = modal('<h3>' + I.target + ' 로고 위치·크기</h3><p class="muted">그림을 끌어서 위치를, 아래 막대로 크기를 맞추세요. <b>네모 칸 안</b>이 로고가 됩니다.</p>' +
        '<div class="lc-stage" id="lcStage"><img id="lcImg" alt="" draggable="false"><div class="lc-frame"></div></div>' +
        '<div class="lc-zoom"><span>작게</span><input type="range" id="lcZoom" min="0" max="1000" value="' + toV(c.s) + '"><span>크게</span></div>' +
        '<div class="lc-opts"><button class="btn gray sm" data-lc="fit">전체 보이게</button><button class="btn gray sm" data-lc="cover">칸 꽉 채우기</button>' +
        '<span class="lc-bg">빈 곳<button data-lc-bg="white" class="on">흰색</button><button data-lc-bg="none">투명</button></span></div>' +
        '<div class="acts"><button class="btn gray" data-lc="cancel">취소</button><button class="btn" data-lc="ok">이대로 쓰기</button></div>');
      bg.dataset.lock = '1'; // 끌다가 창 밖에서 손을 떼도 닫히지 않게
      const stage = bg.querySelector('#lcStage'), im = bg.querySelector('#lcImg'), zoom = bg.querySelector('#lcZoom');
      im.src = pic.toDataURL ? pic.toDataURL() : src;
      const clamp = () => { const mx = (W * c.s) / 2 + V / 2 - 20, my = (H * c.s) / 2 + V / 2 - 20; c.x = Math.max(-mx, Math.min(mx, c.x)); c.y = Math.max(-my, Math.min(my, c.y)); };
      const draw = () => {
        clamp();
        im.style.width = W * c.s + 'px'; im.style.height = H * c.s + 'px';
        im.style.left = SV / 2 + c.x - (W * c.s) / 2 + 'px'; im.style.top = SV / 2 + c.y - (H * c.s) / 2 + 'px';
        stage.classList.toggle('clear', c.bg === 'none');
      };
      const setS = (s, keepSlider) => { c.s = Math.max(sMin, Math.min(sMax, s)); if (!keepSlider) zoom.value = toV(c.s); draw(); };
      zoom.addEventListener('input', () => setS(sMin * Math.pow(sMax / sMin, zoom.value / 1000), true));
      // 끌기 · 두 손가락 벌리기
      const pts = new Map(); let pinch = 0;
      const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
      stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) pinch = dist(); e.preventDefault(); });
      stage.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId); if (!p) return;
        if (pts.size === 1) { c.x += e.clientX - p.x; c.y += e.clientY - p.y; }
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 2) { const d = dist(); if (pinch) setS(c.s * d / pinch); pinch = d; } else draw();
      });
      const up = (e) => { pts.delete(e.pointerId); pinch = pts.size === 2 ? dist() : 0; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (e) => { e.preventDefault(); setS(c.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lc],[data-lc-bg]'); if (!b) return;
        if (b.dataset.lcBg) { c.bg = b.dataset.lcBg; bg.querySelectorAll('[data-lc-bg]').forEach((x) => x.classList.toggle('on', x === b)); draw(); return; }
        const k = b.dataset.lc;
        if (k === 'fit' || k === 'cover') { c.x = 0; c.y = 0; setS(k === 'fit' ? fit : cover); return; }
        if (k === 'cancel') { closeModal(); return; }
        // 이대로 쓰기: 칸 안을 160px(크면 128px, 그래도 크면 흰 바탕 JPEG)로 만든다
        const make = (n, white) => {
          const cv = document.createElement('canvas'); cv.width = cv.height = n;
          const x = cv.getContext('2d'), k2 = n / V;
          if (white) { x.fillStyle = '#fff'; x.fillRect(0, 0, n, n); }
          x.imageSmoothingQuality = 'high';
          x.drawImage(pic, (V / 2 + c.x - (W * c.s) / 2) * k2, (V / 2 + c.y - (H * c.s) / 2) * k2, W * c.s * k2, H * c.s * k2);
          return cv;
        };
        const white = c.bg === 'white';
        let data = make(160, white).toDataURL('image/png');
        if (data.length > 40000) data = make(128, white).toDataURL('image/png');
        if (data.length > 40000) data = make(160, true).toDataURL('image/jpeg', 0.85);
        closeModal();
        S.cache.logo = data; S.cache.logoSrc = { src, out: data }; // 다시 조정할 때는 원본 그림으로
        const p = $('#logoPrev'); if (p) p.innerHTML = '<img src="' + data + '" alt="">';
        const cb = $('#logoCropBtn'); if (cb) cb.hidden = false;
        if ($('#lgSize') && S.team) logoBgColor(data).then((bgc) => { logoPreview(); S.cache.logoStyle.bg = bgc; logoPreview(); });
      });
      draw();
    };
    img.onerror = () => toast('그림을 읽지 못했습니다', 'error');
    img.src = src;
  }
  function createHtml() {
    const days = S.cache.newDays || (S.cache.newDays = [{ weekday: 3, time: '20:00', end: '22:00', place: '' }]);
    return barHtml('팀 만들기', true, '만든 사람이 대표가 됩니다') + '<main><div class="card" id="crForm">' +
      '<label class="f">팀 이름 *</label><input class="in" id="crTeamName" maxlength="30" placeholder="예: 한강 썬더스">' + logoField('') +
      '<label class="f">대한민국농구협회 등록 팀인가요? *</label><select class="in" id="crKba"><option value="">선택하세요</option><option value="yes">예 — 협회에 등록된 팀</option><option value="no">아니오 — 등록하지 않은 동호회</option></select>' +
      '<label class="f">지역(시·도) *</label><select class="in" id="crSido"><option value="">선택하세요</option>' + Api.SIDO.map((s) => '<option' + (((S.cache.ex || {}).sido || '서울') === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<label class="f">활동 지역·체육관</label><input class="in" id="crArea" maxlength="40" placeholder="예: 마포구 망원체육관">' +
      '<label class="f">팀 소개 (다른 팀에게도 보입니다)</label><textarea class="in" id="crIntro" maxlength="300" placeholder="모임 요일, 실력, 모집 여부 등"></textarea>' +
      '<label class="f">농구하는 날 (참석 체크에 쓰입니다 · 요일 / 시작~끝 시간 / 장소)</label><div id="crDays">' + dayRowsHtml(days) + '</div><button class="btn line sm mt8" data-act="dayAdd">+ 요일 추가</button>' +
      '</div><div class="card"><h2>' + I.user + ' 대표 정보</h2>' + profileFields(null, 'cr') + '</div><button class="btn block" data-act="createTeam">팀 만들기</button></main>';
  }

  /* =========================================================
   *  팀 화면
   * ========================================================= */
  async function teamHtml() {
    const r = S.route;
    const t = await Api.getTeam(r.teamId);
    if (S.route === r) S.team = t;
    S.mems = await Api.myMemberships();
    const tabs = t.isMember
      ? [['attend', '참석'], ['status', '현황'], ['lineup', '팀 편성'], ['games', '기록']].concat(t.isAdmin ? [['admin', '관리']] : []) // 게시판은 0.5.1 에서 메뉴만 뺌 (게시판·투표·캘린더는 나중에 결정)
      : [['info', '팀 소개'], ['status', '참석 현황'], ['games', '경기 기록']];
    if (!tabs.some((x) => x[0] === r.tab)) r.tab = tabs[0][0];
    let body;
    switch (r.tab) {
      case 'attend': body = await attendHtml(t); break;
      case 'status': body = await statusHtml(t); break;
      case 'board': body = await boardHtml(t); break;
      case 'lineup': body = await lineupHtml(t); break;
      case 'games': body = await Ext.gamesHtml(t); break;
      case 'admin': body = await adminHtml(t); break;
      default: body = infoHtml(t);
    }
    return teamBarHtml(t) +
      '<div class="tabs">' + tabs.map((x) => '<button class="tab ' + (x[0] === r.tab ? 'on' : '') + '" data-act="tab" data-v="' + x[0] + '">' + x[1] + (x[0] === 'admin' && t.pendingCount ? '<span class="dot">' + t.pendingCount + '</span>' : '') + '</button>').join('') + '</div>' +
      '<main>' + body + '</main>';
  }

  /* 팀 화면 상단 바. 로고 크기·위치·테두리·'상단 바를 로고 배경색으로'는 team.logoStyle (관리 탭에서 고르는 중이면 그 값으로 미리 보기) */
  const LOGO_DEF = { size: 'm', pos: 'right', border: true, blend: false, bg: '' };
  const logoStyleOf = (t) => (S.route.tab === 'admin' && S.cache.logoStyle) || Object.assign({}, LOGO_DEF, t.logoStyle || {});
  function teamBarHtml(t) {
    const st = logoStyleOf(t);
    const logo = S.route.tab === 'admin' && S.cache.logo !== undefined ? S.cache.logo : t.logo;
    const others = S.mems.filter((m) => m.status === 'active' && m.teamId !== t.id).length;
    const sw = t.isMember && others ? '<button class="ab-btn" data-act="switchTeam">팀 바꾸기</button>' : '';
    const lg = logo ? '<div class="ab-logo sz-' + st.size + (st.border ? '' : ' no-border') + '"><img src="' + esc(logo) + '" alt="' + esc(t.name) + ' 로고"></div>' : '';
    const sub = t.sido + (t.area ? ' · ' + t.area : '') + ' · 팀원 ' + t.memberCount + '명';
    const showBack = !t.isMember || S.stack.length > 0;
    let h = barHtml(t.name, showBack, sub, sw + (st.pos === 'right' ? lg : ''));
    if (lg && st.pos === 'left') h = h.replace('<h1>', lg + '<h1>'); // 왼쪽 = 제목 앞
    if (lg && st.blend && /^#[0-9a-f]{6}$/i.test(st.bg)) h = h.replace('<header class="appbar">', '<header class="appbar blend' + (lum(st.bg) > 0.6 ? ' light' : '') + '" style="background:' + st.bg + '">');
    return h;
  }
  /* 관리 탭에서 로고 설정을 바꾸면 상단 바만 바로 다시 그린다 */
  function logoPreview() {
    const g = (id) => $('#' + id);
    if (!g('lgSize') || !S.team) return;
    const cur = logoStyleOf(S.team);
    S.cache.logoStyle = { size: g('lgSize').value, pos: g('lgPos').value, border: g('lgBorder').value === '1', blend: g('lgBlend').value === '1', bg: cur.bg };
    const ab = $('.appbar'); if (ab) ab.outerHTML = teamBarHtml(S.team);
    syncBarHeight();
  }
  /* 상단 바 높이(로고 크기에 따라 바뀜)에 맞춰 탭 줄이 붙도록 */
  function syncBarHeight() { const ab = $('.appbar'); if (ab) document.documentElement.style.setProperty('--ab-h', ab.offsetHeight + 'px'); }
  /* 로고 그림의 가장자리 색 = 로고 배경색. 투명하면 흰색으로 본다 */
  function logoBgColor(src) {
    return new Promise((res) => {
      if (!src) { res(''); return; }
      const img = new Image();
      img.onload = () => {
        const n = 32, c = document.createElement('canvas'); c.width = c.height = n;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, n, n); x.drawImage(img, 0, 0, n, n);
        const d = x.getImageData(0, 0, n, n).data, sum = [0, 0, 0]; let k = 0;
        for (let i = 0; i < n; i++) [[i, 0], [i, n - 1], [0, i], [n - 1, i]].forEach(([px, py]) => { const o = (py * n + px) * 4; sum[0] += d[o]; sum[1] += d[o + 1]; sum[2] += d[o + 2]; k++; });
        const avg = sum.map((v) => v / k);
        res(Math.min.apply(null, avg) >= 236 ? '#ffffff' : rgbHex(avg)); // 거의 흰색(압축·가장자리 번짐)은 흰색으로 — 회색 바처럼 보이지 않게
      };
      img.onerror = () => res('');
      img.src = src;
    });
  }
  function logoOptsHtml(t) {
    const st = logoStyleOf(t);
    const sel = (id, cur, opts) => '<select class="in" id="' + id + '" data-lg>' + opts.map((o) => '<option value="' + o[0] + '"' + (String(cur) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    return '<div class="logo-opts">' +
      '<div><label class="f">로고 크기</label>' + sel('lgSize', st.size, [['s', '작게'], ['m', '보통'], ['l', '크게'], ['xl', '아주 크게']]) + '</div>' +
      '<div><label class="f">로고 위치</label>' + sel('lgPos', st.pos, [['right', '오른쪽'], ['left', '왼쪽 (팀 이름 앞)']]) + '</div>' +
      '<div><label class="f">로고 테두리</label>' + sel('lgBorder', st.border ? '1' : '0', [['1', '있음'], ['0', '없음']]) + '</div>' +
      '<div><label class="f">상단 바 색</label>' + sel('lgBlend', st.blend ? '1' : '0', [['0', '팀 색상'], ['1', '로고 배경색과 하나로']]) + '</div></div>' +
      '<p class="muted mt8" id="lgNote">' + (st.blend && st.bg ? '로고 배경색<span class="lg-bg" style="background:' + esc(st.bg) + '"></span> 으로 상단 바를 칠합니다. 흰 배경 로고는 테두리를 없애면 상단 바와 하나로 보입니다.' : '흰 배경 로고는 테두리 <b>없음</b> + 상단 바 <b>로고 배경색과 하나로</b>를 고르면 구분선 없이 이어집니다.') + ' 바꾸면 위 상단 바에 바로 보이고, <b>팀 정보 저장</b>을 눌러야 적용됩니다.</p>';
  }

  /* ----- 다른 팀이 보는 팀 소개 ----- */
  function infoHtml(t) {
    const st = t.my ? t.my.status : '';
    const join = st === 'pending'
      ? '<div class="card"><h2>' + I.hourglass + ' 가입 승인 대기 중</h2><p class="muted">대표나 관리자가 수락하면 참석 체크·팀 편성·기록 입력을 쓸 수 있습니다.</p><button class="btn gray block mt12" data-act="cancelJoin">신청 취소</button></div>'
      : '<div class="card"><h2>' + I.userPlus + ' 이 팀에 가입하기</h2><p class="muted">가입 신청을 보내면 대표·관리자가 수락한 뒤 팀원이 됩니다.</p><button class="btn block mt12" data-act="joinDlg">가입 신청</button></div>';
    return join +
      '<div class="card"><h2>' + I.clipboard + ' 팀 소개</h2><div class="row" style="margin-bottom:10px">' + teamAv(t.logo, t.name, 'lg') + '<div><b>' + esc(t.name) + '</b><div class="row mt8">' + (kbaChip(t.kba) || '<span class="chip gray">협회 미등록</span>') + '</div></div></div><p class="notice">' + (t.intro ? esc(t.intro) : '<span class="empty">소개 글이 없습니다.</span>') + '</p>' +
      '<p class="muted mt12">농구하는 날: ' + (t.days.map((d) => esc(Api.WEEKDAYS[d.weekday] + ' ' + d.time + (d.end ? '~' + d.end : '') + (d.place ? ' ' + d.place : ''))).join(' / ') || '-') + '</p></div>' +
      '<div class="card"><h2>' + I.lock + ' 팀원 전용</h2><div class="lock">공지사항·한마디·회비 정보는 팀원에게만 보입니다.</div></div>' +
      membersCard(t, false);
  }
  /* 팀원 목록: 기본(역할·회원 구분) · 포지션(G-F-C) · 나이 · 확인 항목(회비 등)별로 정렬. 같은 버튼을 한 번 더 누르면 반대로 */
  function membersCard(t, clickable) {
    const ms = S.cache.memSort || (S.cache.memSort = { k: 'role', desc: false });
    const keys = [['role', '기본'], ['pos', '포지션']].concat(t.isMember ? [['age', '나이']].concat(t.checkItems.map((c) => ['ck:' + c.id, c.label])) : []);
    if (!keys.some((k) => k[0] === ms.k)) { ms.k = 'role'; ms.desc = false; }
    const year = new Date().getFullYear(), dir = ms.desc ? -1 : 1, ck = ms.k.indexOf('ck:') === 0 ? ms.k.slice(3) : '';
    const posKey = (m) => (TG_POS.includes(m.position) ? m.position : '');
    const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
    const list = t.members.slice();
    let grp = null, how = '역할·회원 구분 순';
    if (ms.k === 'pos') {
      list.sort((a, b) => dir * (POS_ORD[posKey(a)] - POS_ORD[posKey(b)]) || byName(a, b));
      grp = (m) => ({ '가드': 'G · 가드', '포워드': 'F · 포워드', '센터': 'C · 센터' }[posKey(m)] || '포지션 미정');
      how = ms.desc ? '센터 → 가드' : '가드 → 포워드 → 센터';
    } else if (ms.k === 'age') { // 기본: 나이 많은 순 (출생연도 없는 사람은 맨 뒤)
      list.sort((a, b) => { const x = +a.birthYear || 0, y = +b.birthYear || 0; if (!x !== !y) return x ? -1 : 1; return dir * (x - y) || byName(a, b); });
      grp = (m) => (+m.birthYear ? Math.floor((year - m.birthYear) / 10) * 10 + '대' : '출생연도 미입력');
      how = ms.desc ? '나이 적은 순' : '나이 많은 순';
    } else if (ck) { // 기본: 미완료 먼저
      list.sort((a, b) => dir * ((a.checks[ck] ? 1 : 0) - (b.checks[ck] ? 1 : 0)) || byName(a, b));
      const lb = (t.checkItems.find((c) => c.id === ck) || {}).label || '';
      grp = (m) => lb + (m.checks[ck] ? ' 완료' : ' 미완료');
      how = ms.desc ? '완료 먼저' : '미완료 먼저';
    } else if (ms.desc) { list.reverse(); how = '역할·회원 구분 반대 순'; }
    const cnt = {}; if (grp) list.forEach((m) => { const g = grp(m); cnt[g] = (cnt[g] || 0) + 1; });
    let last = null;
    const rows = list.map((m) => {
      let hd = '';
      if (grp) { const g = grp(m); if (g !== last) { last = g; hd = '<div class="mem-grp">' + esc(g) + ' <span>' + cnt[g] + '명</span></div>'; } }
      const tag = (m.role !== 'member' ? '<span class="chip">' + ROLE[m.role] + '</span>' : '') + (m.memberType !== '정회원' ? '<span class="chip gray">' + m.memberType + '</span>' : '');
      const extra = t.isMember && m.memberType === '정회원' ? t.checkItems.filter((c) => !m.checks[c.id]).map((c) => ' · <span style="color:var(--error)">' + esc(c.label) + ' 미완료</span>').join('') : '';
      const age = ms.k === 'age' && +m.birthYear ? ' · ' + esc(m.birthYear) + '년생' : '';
      return hd + '<' + (clickable ? 'button data-act="memDlg" data-id="' + m.userId + '"' : 'div') + ' class="mem' + (m.memberType === '휴식회원' ? ' rest' : '') + '"><div class="no">' + (m.number ? esc(m.number) : initial(m.name)) + '</div><div class="grow"><div class="row"><span class="nm">' + esc(m.name) + '</span>' + tag + '</div><div class="ds">' + esc(m.position || '포지션 미정') + age + extra + '</div></div>' + (clickable ? '<span class="muted">›</span>' : '') + '</' + (clickable ? 'button' : 'div') + '>';
    }).join('');
    return '<div class="card"><h2>' + I.users + ' 팀원 ' + t.members.length + '명</h2>' +
      '<div class="mem-sort">' + keys.map((k) => '<button data-act="memSort" data-v="' + esc(k[0]) + '" class="' + (ms.k === k[0] ? 'on' : '') + '">' + esc(k[1]) + '</button>').join('') + '</div>' +
      '<p class="mem-how">정렬: ' + esc(how) + (ms.k !== 'role' || ms.desc ? ' · 한 번 더 누르면 반대로' : '') + '</p>' + rows + '</div>';
  }

  /* ----- 참석 ----- */
  async function attendHtml(t) {
    const a = await Api.getAttendance(t.id);
    S.att = a;
    const p = t.my.profile;
    const chosen = S.cache.attPick && S.cache.attPick.team === t.id ? S.cache.attPick.days : (a.mine ? a.mine.days.slice() : []);
    S.cache.attPick = { team: t.id, days: chosen };
    const badge = p.memberType === '정회원' ? (t.checkItems.map((c) => (p.checks[c.id] ? '<span class="chip">' + esc(c.label) + ' 완료</span>' : '<span class="chip warn">' + esc(c.label) + ' 미완료</span>')).join('') || '<span class="chip">정회원</span>') : '<span class="chip gray">' + p.memberType + '</span>';
    // 접기·펼치기 상태 (팀을 바꾸면 처음 상태로)
    const ui = S.cache.attUi && S.cache.attUi.team === t.id ? S.cache.attUi : (S.cache.attUi = { team: t.id, notice: false, chat: false, sel: '', open: false, write: false });
    if (ui.sel && !t.days.some((d) => d.id === ui.sel)) ui.sel = '';
    return '<div class="att">' + noticeBoard(t, ui) + countCard(t, a, ui) + chatCard(t, a, ui) +
      '<div class="card ckf' + (ui.open ? ' open' : '') + (a.mine ? '' : ' todo') + '" id="ckf"><button class="ckf-hd" data-act="attFold"><span class="ckf-ic">' + I.check + '</span><span><span class="ckf-t">이번 주 참석 체크</span>' +
      (a.mine ? '<span class="ckf-s">제출함 · <b>' + esc(shortDays(t, a.mine.days)) + '</b> · 눌러서 수정</span>' : '<span class="ckf-s todo"><b>아직 안 했어요</b> · 눌러서 체크하기</span>') + '</span><span class="ckf-ar">▾</span></button>' +
      '<div class="ckf-body">' +
      '<div class="me-card"><span><b>이름</b>' + esc(p.name) + '</span><span><b>등번호</b>' + esc(p.number || '-') + '</span><span><b>포지션</b>' + esc(p.position || '-') + '</span><span><b>역할</b>' + ROLE[t.my.role] + '</span><div class="row wrap" style="width:100%;gap:6px">' + badge + '<button class="linkbtn" data-act="myProfile" style="margin-left:auto">내 정보 수정</button></div></div>' +
      (a.mine ? '<div class="prev">' + I.alert + ' 이번 주에 이미 제출했습니다: <b>' + esc(dayNames(t, a.mine.days)) + '</b> · 다시 제출하면 수정됩니다.</div>' : '') +
      '<label class="f">참석 가능일 *</label>' +
      t.days.map((d) => dayBlock(d.id, d.title, (d.place || '') + (d.passed ? ' · 지난 날' : ''), chosen.includes(d.id), d.passed)).join('') +
      dayBlock('none', '모두 불참', '이번 주는 참석이 어려워요.', chosen.includes('none'), false) +
      '<label class="f">한마디 (팀원에게만 보입니다)</label><textarea class="in" id="attCmt" maxlength="200" placeholder="예: 조금 늦어요">' + esc(S.cache.attCmt != null && S.cache.attCmtTeam === t.id ? S.cache.attCmt : (a.mine ? a.mine.comment : '')) + '</textarea>' +
      '<button class="btn block mt12" data-act="attSubmit">' + (a.mine ? '수정해서 제출' : '제출하기') + '</button>' + teamLinkCard(t, true) + '</div></div></div>';
  }
  /* 요일만 짧게: '목, 토' */
  const shortDays = (t, ids) => ids.map((id) => (id === 'none' ? '모두 불참' : Api.WEEKDAYS[(t.days.find((d) => d.id === id) || {}).weekday] || '삭제된 요일')).join(', ');
  /* 공지사항 = 게시판 (5줄 넘으면 접고 '더보기' — 넘는지는 그린 뒤 높이를 재서 afterRender 가 정한다) */
  function noticeBoard(t, ui) {
    if (!t.notice || !t.notice.trim()) return '<div class="card nb empty"><div class="nb-hd">' + I.megaphone + ' 공지사항<span class="fold-more">등록된 공지가 없습니다</span></div></div>';
    return '<div class="card nb' + (ui.notice ? '' : ' clamp') + '" data-act="attNotice"><div class="nb-hd">' + I.megaphone + ' 공지사항<span class="fold-more">' + (ui.notice ? '접기 ▴' : '더보기 ▾') + '</span></div>' +
      '<div class="nb-body"><span class="nb-tag">공지</span>' + esc(t.notice) + '</div></div>';
  }
  /* 참석 인원: 요일마다 큰 숫자. 날짜를 누르면 그날 참석자 + '현황 보기' 켜짐 */
  function countCard(t, a, ui) {
    const nx = nextDayId(t), sel = t.days.find((d) => d.id === ui.sel);
    const tiles = t.days.map((d) => '<button class="ct' + (d.id === nx ? ' next' : '') + (d.passed ? ' past' : '') + (d.id === ui.sel ? ' on' : '') + '" data-act="attDay" data-id="' + d.id + '">' +
      '<span class="w">' + Api.WEEKDAYS[d.weekday] + '<small>' + esc(d.title.split('(')[0]) + '</small></span><span class="n">' + (a.counts[d.id] || 0) + '<span>명</span></span>' +
      '<span class="tm">' + esc(d.time || '') + (d.passed ? ' · 지난 날' : '') + '</span></button>').join('');
    let who = '';
    if (sel) {
      const ppl = a.list.filter((x) => x.days.includes(sel.id));
      who = '<div class="cnt-who"><div class="t">' + esc(sel.title) + ' <span>' + (sel.place ? '· ' + esc(sel.place) + ' ' : '') + '· 참석 ' + ppl.length + '명</span></div>' +
        (ppl.length ? '<div class="who-list">' + ppl.map((x) => '<span class="who' + (x.memberType !== '정회원' ? ' g' : '') + '">' + esc(x.name) + (x.memberType !== '정회원' ? '(' + esc(x.memberType) + ')' : '') + '</span>').join('') + '</div>' : '<p class="empty">아직 참석한다고 한 사람이 없습니다.</p>') + '</div>';
    }
    return '<div class="card cnt"><div class="cnt-hd"><h2>' + I.chart + ' 참석 인원' + (sel || !t.days.length ? '' : '<span class="cnt-hint">날짜를 누르면 명단</span>') + '</h2>' +
      '<button class="btn sm" data-act="attGoStatus"' + (sel ? '' : ' disabled') + '>현황 보기 ›</button></div>' +
      (t.days.length ? '<div class="cnt-row">' + tiles + '</div>' : '<p class="empty">농구하는 날이 없습니다.</p>') + who + '</div>';
  }
  /* 한마디 = 카카오톡 채팅. 접힘: 최근 5개 한 줄씩 · 펼침: 전부 + 칸 안 스크롤 + 입력창 */
  const CMT_FOLD = 5;
  function kkTime(ms) {
    if (!ms) return '';
    const d = new Date(ms), today = new Date(); today.setHours(0, 0, 0, 0);
    const h = d.getHours(), day = d >= today ? '오늘' : Api.WEEKDAYS[d.getDay()];
    return day + ' ' + (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function chatCard(t, a, ui) {
    const cmts = a.list.filter((x) => x.comment);
    // 한마디는 한 주에 한 사람 하나 — 이미 남겼으면 보내는 말로 바뀐다
    const input = '<div class="kk-in"><input id="kkIn" maxlength="200" placeholder="' + (a.mine && a.mine.comment ? '내 한마디 바꾸기 (한 주에 하나)' : '한마디 남기기 (예: 조금 늦어요)') + '"><button data-act="attChatSend">전송</button></div>';
    if (!cmts.length) return '<div class="card kk-card"><div class="kk-hd">' + I.chat + ' 한마디 <span class="none">· 아직 없어요</span>' + (ui.write ? '' : '<button class="kk-empty" data-act="attChatWrite">남기기 ✎</button>') + '</div>' + (ui.write ? input : '') + '</div>';
    const many = cmts.length > CMT_FOLD, open = ui.chat || !many;
    const meId = a.mine ? a.mine.userId : '';
    const msgs = cmts.map((c, i) => {
      const old = many && i < cmts.length - CMT_FOLD ? ' old' : '';
      if (c.userId === meId) return '<div class="kk-m me' + old + '"><div class="kk-c"><div class="kk-line"><div class="kk-b">' + esc(c.comment) + '</div><span class="kk-tm">' + kkTime(c.at) + '</span></div></div></div>';
      const m = t.members.find((x) => x.userId === c.userId);
      return '<div class="kk-m' + old + '"><div class="kk-av">' + (m && m.number ? esc(m.number) : initial(c.name)) + '</div><div class="kk-c"><div class="kk-nm">' + esc(c.name) + '</div><div class="kk-line"><div class="kk-b">' + esc(c.comment) + '</div><span class="kk-tm">' + kkTime(c.at) + '</span></div></div></div>';
    }).join('');
    return '<div class="card kk-card' + (open ? ' open' : '') + (many ? ' many' : '') + '" id="kkCard"><div class="kk-hd"' + (many ? ' data-act="attChat"' : '') + '>' + I.chat + ' 한마디 <small>팀원에게만</small>' +
      (many ? '<span class="fold-more kk-fold">접기 ▴</span>' : '') + '</div>' +
      '<div class="kk"' + (many && !open ? ' data-act="attChat"' : '') + '><div class="kk-day"><span>이번 주 한마디 ' + cmts.length + '개</span></div>' + msgs + '</div>' +
      (many ? '<button class="kk-more" data-act="attChat">더보기 · 한마디 ' + cmts.length + '개 ▾</button>' : '') + input + '</div>';
  }
  function dayBlock(id, title, desc, on, past) {
    return '<button class="day-block ' + (on ? 'on ' : '') + (past ? 'past' : '') + '" data-act="attPick" data-id="' + id + '"><span class="ck">' + (on ? '✓' : '') + '</span><span class="grow"><span class="dt">' + esc(title) + '</span>' + (desc ? '<div class="dd">' + esc(desc) + '</div>' : '') + '</span></button>';
  }
  const dayNames = (t, ids) => ids.map((id) => (id === 'none' ? '모두 불참' : ((t.days.find((d) => d.id === id) || {}).title || '삭제된 요일'))).join(', ');
  /* 이번 주에서 가장 가까운(아직 지나지 않은) 농구하는 날 */
  const nextDayId = (t) => { const d = t.days.find((x) => !x.passed); return d ? d.id : ''; };
  function summaryCard(t, a) {
    const nx = nextDayId(t);
    return '<div class="card"><h2>' + I.chart + ' 이번 주 참석 인원' + (t.isMember && S.route.tab !== 'status' ? '<button class="btn line sm right" data-act="tab" data-v="status">현황 보기</button>' : '') + '</h2><div class="summary">' +
      (t.days.length ? t.days.map((d) => d.id === nx // 가장 가까운 날은 글자 표시 없이 테두리 색으로만 구분
        ? '<div class="s-item next"><span class="s-day">' + esc(d.title) + (d.place ? '<small>' + esc(d.place) + '</small>' : '') + '</span><span class="s-cnt"><b>' + (a.counts[d.id] || 0) + '</b>명</span></div>'
        : '<span class="s-item ' + (d.passed ? 'past' : '') + '">' + esc(d.title) + ' <b>' + (a.counts[d.id] || 0) + '</b>명</span>').join('') : '<span class="empty">농구하는 날이 없습니다.</span>') + '</div></div>';
  }

  /* ----- 현황 ----- */
  async function statusHtml(t) {
    const a = await Api.getAttendance(t.id);
    if (!a.list) return summaryCard(t, a) + '<div class="card"><div class="lock">' + I.lock + ' 누가 참석하는지와 한마디는 팀원에게만 보입니다.</div></div>';
    const voted = {}; a.list.forEach((x) => { voted[x.userId] = x; });
    const regular = t.members.filter((m) => m.memberType === '정회원');
    const notVoted = regular.filter((m) => !voted[m.userId]).map((m) => m.name);
    const nx = nextDayId(t);
    const secs = t.days.map((d) => {
      const yes = a.list.filter((x) => x.days.includes(d.id)).map((x) => x.name + (x.memberType !== '정회원' ? '(' + x.memberType + ')' : ''));
      const no = regular.filter((m) => voted[m.userId] && !voted[m.userId].days.includes(d.id)).map((m) => m.name);
      return '<div class="st-sec' + (d.id === nx ? ' next' : (d.passed ? ' past' : '')) + '" id="st-' + d.id + '">' +
        '<h3>' + esc(d.title) + (d.place ? ' <span class="muted">' + esc(d.place) + '</span>' : '') + (d.passed ? ' <span class="muted">· 지난 날</span>' : '') + '</h3>' +
        '<div class="st-line"><span class="tag yes">참석 ' + yes.length + '</span>' + (esc(yes.join(', ')) || '-') + '</div>' +
        '<div class="st-line"><span class="tag no">불참 ' + no.length + '</span>' + (esc(no.join(', ')) || '-') + '</div></div>';
    }).join('');
    return summaryCard(t, a) + '<div class="card"><h2>' + I.calendar + ' 요일별 현황</h2>' + secs +
      '<div class="st-sec"><h3>아직 체크 안 한 정회원 ' + notVoted.length + '명</h3><div class="st-line"><span class="tag none">미체크</span>' + (esc(notVoted.join(', ')) || '-') + '</div></div></div>' +
      membersCard(t, false);
  }

  /* ----- 게시판 ----- */
  async function boardHtml(t) {
    const posts = await Api.listPosts(t.id);
    return '<div class="card"><h2>' + I.pencil + ' 글쓰기 <span class="muted" style="font-weight:500;font-size:.76rem">팀원에게만 보입니다</span></h2><textarea class="in" id="postBody" maxlength="1000" placeholder="팀원들에게 남길 글"></textarea><button class="btn block mt8" data-act="postAdd">올리기</button></div>' +
      '<div class="card"><h2>' + I.note + ' 게시판</h2>' + (posts.length ? posts.map((p) => '<div class="post"><div class="hd"><b>' + esc(p.name) + '</b><span>' + fmtTime(p.at) + '</span>' + (p.mine || t.isAdmin ? '<button class="linkbtn" style="margin-left:auto" data-act="postDel" data-id="' + p.id + '">삭제</button>' : '') + '</div>' +
        '<div class="bd">' + esc(p.body) + '</div>' +
        p.comments.map((c) => '<div class="cm"><b>' + esc(c.name) + '</b><span>' + esc(c.body) + '</span>' + (c.mine || t.isAdmin ? '<button class="x" data-act="cmtDel" data-p="' + p.id + '" data-id="' + c.id + '">✕</button>' : '') + '</div>').join('') +
        '<div class="row mt8"><input class="in" style="padding:8px 10px;font-size:.86rem" id="cm_' + p.id + '" maxlength="500" placeholder="댓글 달기"><button class="btn sm" data-act="cmtAdd" data-id="' + p.id + '">등록</button></div></div>').join('') : '<p class="empty">아직 글이 없습니다.</p>') + '</div>';
  }

  /* ----- 팀 편성 ----- */
  /* 팀 편성 상태: day 진행일 · added 따로 추가한 팀원 · off 제외한 사람 · guests 직접 적은 게스트
     mode 'num'(2~4팀) | 'ybob'(YB vs OB) · same/diff 같은 팀·다른 팀 조건(선수 key 묶음) */
  function tgState(t, a) {
    let tg = S.cache.tg;
    if (!tg || tg.team !== t.id) {
      const upcoming = t.days.find((d) => !d.passed) || t.days[t.days.length - 1];
      tg = S.cache.tg = { team: t.id, day: upcoming ? upcoming.id : '', added: [], off: [], guests: [], guestPos: {}, mode: 'num', count: 2, same: [], diff: [], result: null, savedDate: '' };
    }
    return tg;
  }
  /* 참가자 = 그날 참석 체크한 사람 + '회원·게스트 추가'로 넣은 사람 */
  function tgPoolOf(t, tg, a) {
    const ids = new Set(attendeesOf(a, tg.day).concat(tg.added));
    return t.members.filter((m) => ids.has(m.userId)).map((m) => ({ key: m.userId, name: m.name, position: m.position, guest: false, birthYear: m.birthYear }))
      .concat(tg.guests.map((g) => ({ key: 'g:' + g, name: g, position: tg.guestPos[g] || '', guest: true })));
  }
  const tgCount = (tg) => (tg.mode === 'ybob' ? 2 : tg.count);
  const tgLabel = (tg, i) => (tg.mode === 'ybob' ? ['YB', 'OB'][i] : String.fromCharCode(65 + i));
  // 저장 대상 날짜: 저장분을 불러와 고치는 중이면 그 날짜, 아니면 이번 주 그 요일
  const tgTargetDate = (t, tg) => tg.savedDate || (t.days.find((d) => d.id === tg.day) || {}).date || U.ymd(new Date());
  const POS_LBL = { '가드': 'G', '포워드': 'F', '센터': 'C' };
  const POS_ORD = { '가드': 0, '포워드': 1, '센터': 2, '': 3 };
  const byPos = (a, b) => (POS_ORD[a.position || ''] - POS_ORD[b.position || '']) || a.name.localeCompare(b.name, 'ko');

  async function lineupHtml(t) {
    const a = await Api.getAttendance(t.id);
    const tg = tgState(t, a);
    const pool = S.tgPool = tgPoolOf(t, tg, a).sort(byPos);
    // 실력 점수: 회원 구분과 상관없이 이 팀 선수의 경기 기록(본인 참석 최근 5일)으로 계산
    S.tgSk = Stats.skillMap(Stats.summary(await Api.listGames(t.id), t.members.map((m) => Object.assign({}, m, { memberType: '정회원' }))));
    const on = pool.filter((p) => !tg.off.includes(p.key));
    const comp = [['num', 2, '2팀'], ['num', 3, '3팀'], ['num', 4, '4팀'], ['ybob', 2, 'YB vs OB']];
    // 분배 조건 (같은 팀·다른 팀)
    const sel = (kind, r, m, value) => '<select class="in tgc" data-kind="' + kind + '" data-r="' + r + '" data-m="' + m + '"><option value="">-- 선택 --</option>' +
      on.map((p) => '<option value="' + esc(p.key) + '"' + (p.key === value ? ' selected' : '') + '>' + (POS_LBL[p.position] || '-') + ' ' + esc(p.name) + (p.guest ? ' (게스트)' : '') + '</option>').join('') + '</select>';
    const rowsOf = (kind, max) => tg[kind].map((mem, r) => '<div class="tgc-row">' + mem.map((k, m) => sel(kind, r, m, k)).join('') +
      (mem.length < max ? '<button class="btn sm" data-act="tgcAddM" data-kind="' + kind + '" data-r="' + r + '">+</button>' : '') +
      '<button class="btn gray sm" data-act="tgcDel" data-kind="' + kind + '" data-r="' + r + '">✕</button></div>').join('') || '<p class="muted">조건 없음</p>';
    const nCond = tg.same.length + tg.diff.length;
    const cond = tg.mode === 'ybob' ? '<p class="muted mt12">YB vs OB 는 출생연도로 나눕니다. (올해 40세 이상 = OB · 출생연도가 없으면 인원 적은 팀으로)</p>'
      : '<details class="ps-help mt12" data-keep="tgc"' + (psState().open.tgc || nCond ? ' open' : '') + '><summary>분배 조건' + (nCond ? ' ' + nCond + '개' : '') + ' (같은 팀 · 다른 팀)</summary>' +
        '<div class="tgc-hd same">같은 팀</div>' + rowsOf('same', 99) + '<button class="btn line sm mt8" data-act="tgcAdd" data-kind="same">+ 추가</button>' +
        '<div class="tgc-hd diff">다른 팀</div>' + rowsOf('diff', tg.count) + '<button class="btn line sm mt8" data-act="tgcAdd" data-kind="diff">+ 추가</button></details>';
    return '<div class="card"><h2>' + I.ball + ' 팀 편성</h2><label class="f">어느 날 농구인가요?</label><div class="seg">' +
      t.days.map((d) => '<button data-act="tgDay" data-id="' + d.id + '" class="' + (tg.day === d.id ? 'on' : '') + '">' + esc(d.title) + ' (' + (a.counts[d.id] || 0) + ')</button>').join('') + '</div>' +
      tgPoolHtml(pool, on) +
      '<label class="f">팀 구성</label><div class="seg">' + comp.map((c) => '<button data-act="tgCount" data-m="' + c[0] + '" data-v="' + c[1] + '" class="' + (tg.mode === c[0] && (c[0] === 'ybob' || tg.count === c[1]) ? 'on' : '') + '">' + c[2] + '</button>').join('') + '</div>' +
      cond +
      '<div class="row mt16"><button class="btn grow" data-act="tgBuild">' + (tg.mode === 'ybob' ? '' + I.users + ' YB · OB 로 나누기' : '' + I.shuffle + ' 포지션 고르게') + '</button>' +
      (tg.mode === 'ybob' ? '' : '<button class="btn grow skill" data-act="tgSkill">' + I.scale + ' 실력 균형 배정</button>') + '</div><button class="btn line block mt8" data-act="tgLoad">저장된 팀 불러오기</button></div>' +
      (tg.result ? '<div class="card"><h2>결과<button class="btn line sm right" data-act="tgCopy">복사</button></h2>' + tgSkillInfoHtml(tg) + '<div class="tg-grid">' +
        tg.result.map((team, i) => '<div class="tg-team" style="border-color:' + (TEAM_COLORS[i % 4] === '#ffffff' ? '#c9ccd3' : TEAM_COLORS[i % 4]) + '"><h4><span class="swatch" style="background:' + TEAM_COLORS[i % 4] + '"></span>' + tgLabel(tg, i) + '팀 <span class="muted">' + team.length + '명</span></h4>' + tgTeamSkillHtml(tg, team) +
          team.map((p) => '<button class="pl" data-act="tgMove" data-k="' + esc(p.key) + '">' + posTag(p.position) + esc(p.name) + (p.guest ? ' <span class="chip orange">G</span>' : '') + '</button>').join('') + '</div>').join('') +
        '</div><p class="muted mt8">이름을 누르면 다른 팀으로 옮깁니다.</p><button class="btn block mt12 save" data-act="tgSave">' + I.save + ' 팀 저장</button>' +
        '<p class="muted mt8">저장 대상: <b>' + esc(tgTargetDate(t, tg)) + '</b>' + (tg.savedDate ? ' (불러온 내용을 수정합니다)' : '') + '<br>저장하면 ' + I.note + ' 기록 입력에서 이 팀을 그대로 불러올 수 있습니다.</p></div>' : '');
  }
  const posTag = (pos) => (POS_LBL[pos] ? '<small class="pl-pos pos-' + POS_LBL[pos] + '">' + POS_LBL[pos] + '</small>' : '');
  /* 참가자 목록: 접었다 펼 수 있는 상자. 접혀 있어도 인원·포지션 수는 보이고, 펼치면 G-F-C 줄로 나눠 보인다 */
  function tgPoolHtml(pool, on) {
    const tg = S.cache.tg, pk = (p) => (TG_POS.includes(p.position) ? p.position : '');
    const n = { '가드': 0, '포워드': 0, '센터': 0, '': 0 }; on.forEach((p) => { n[pk(p)]++; });
    const off = pool.length - on.length, op = psState().open.tgp;
    const open = op != null ? op : pool.length <= 12; // 처음엔 인원이 많으면 접어 둔다
    const pill = (p) => '<button data-act="tgToggle" data-k="' + esc(p.key) + '" class="' + (tg.off.includes(p.key) ? '' : 'on ') + (p.guest ? 'guest' : '') + '">' +
      posTag(p.position) + esc(p.name) + (p.guest ? ' <small>(게스트)</small>' : '') + '</button>';
    const rows = ['가드', '포워드', '센터', ''].map((pos) => { // G → F → C → 미정 줄
      const g = pool.filter((p) => pk(p) === pos);
      return g.length ? '<div class="tg-pos-row"><div class="pick">' + g.map(pill).join('') + '</div></div>' : '';
    }).join('');
    return '<label class="f">참가자 <span style="font-weight:500">(참석 체크한 사람 · 누르면 제외, 다시 누르면 포함)</span></label>' +
      '<details class="tg-pool" data-keep="tgp"' + (open ? ' open' : '') + '><summary><b>' + on.length + '명</b><span class="tg-cnt">G ' + n['가드'] + ' · F ' + n['포워드'] + ' · C ' + n['센터'] + (n[''] ? ' · 미정 ' + n[''] : '') + '</span>' +
      (off ? '<span class="tg-off">제외 ' + off + '</span>' : '') + '</summary>' + (rows || '<p class="empty">참석 체크한 사람이 없습니다. 아래에서 추가하세요.</p>') + '</details>' +
      '<button class="btn line sm mt8" data-act="tgGuest">+ 회원·게스트 추가</button>';
  }
  /* ----- 팀 나누기 (코모도 웹페이지와 같은 규칙) -----
     같은 팀 조건으로 묶인 선수는 한 덩어리로, 다른 팀 조건은 어긴 수가 가장 적은 배정을 고른다.
     bySkill: 기록 있는 선수끼리 팀 평균 실력·포지션별 실력·포지션 수가 고르게 되도록 맞바꿔 가며 찾고,
     기록 없는 선수·게스트는 실력 계산에서 빼고 마지막에 인원 적은 팀으로 넣는다. */
  const TG_SKILL_TOL = 1.5;      // 가장 고른 배정과 이 점수 이내면 '사실상 같은 배정'으로 보고 그중 무작위로 고른다 → 누를 때마다 조합이 달라진다
  const TG_POS_SKILL_W = 3;      // 포지션별 실력 고르게 나누기의 비중
  const TG_SKILL_GAP_WARN = 1;   // 팀 평균 실력 차이가 이 점수를 넘으면 (강한 팀)·(약한 팀) 표시
  const TG_POS = ['가드', '포워드', '센터'];
  const shuffled = (list) => { const v = list.slice(); for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = v[i]; v[i] = v[j]; v[j] = x; } return v; };
  function buildTeamsEx(players, n, opt) {
    const sk = opt.sk, bySkill = !!opt.bySkill;
    const inPlay = {}; players.forEach((p) => { inPlay[p.key] = p; });
    const valid = (list) => (list || []).map((mem) => mem.filter((k, i) => k && inPlay[k] && mem.indexOf(k) === i)).filter((g) => g.length >= 2);
    const same = valid(opt.same), diff = valid(opt.diff);
    // 같은 팀 조건으로 이어진 선수끼리 한 묶음
    const parent = {}; players.forEach((p) => { parent[p.key] = p.key; });
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    same.forEach((mem) => { for (let i = 1; i < mem.length; i++) parent[find(mem[0])] = find(mem[i]); });
    const gm = {}; players.forEach((p) => { const r = find(p.key); (gm[r] || (gm[r] = [])).push(p); });
    const groups = Object.values(gm);
    let singles = groups.filter((g) => g.length === 1).map((g) => g[0]);
    const multi = groups.filter((g) => g.length > 1);
    const has = (p) => !!sk && sk.map[p.key] != null;
    const z = (p) => (sk.map[p.key] - sk.mean) / sk.std;
    // 실력 균형: 실력 점수가 없는 선수는 먼저 빼 둔다 (조건에 걸린 선수는 그대로 함께 배정)
    const inDiff = {}; diff.forEach((mem) => mem.forEach((k) => { inDiff[k] = 1; }));
    const deferred = bySkill ? singles.filter((p) => !has(p) && !inDiff[p.key]) : [];
    if (deferred.length) singles = singles.filter((p) => deferred.indexOf(p) < 0);

    const spread = (v) => { const a = v.reduce((x, y) => x + y, 0) / v.length; return v.reduce((s, x) => s + (x - a) * (x - a), 0); };
    const balance = (teams) => TG_POS.reduce((s, pos) => s + spread(teams.map((t) => t.filter((m) => m.position === pos).length)), 0); // 포지션 수
    const skill = (teams) => (!bySkill ? 0
      : 300 * spread(teams.map((t) => { const r = t.filter(has); return r.length ? r.reduce((s, m) => s + z(m), 0) / r.length : 0; })) + // 팀 평균 실력
        TG_POS_SKILL_W * TG_POS.reduce((s, pos) => s + spread(teams.map((t) => t.reduce((x, m) => x + (m.position === pos && has(m) ? z(m) : 0), 0))), 0)); // 포지션별 실력
    const score = (teams) => balance(teams) + skill(teams);
    const violations = (teams) => diff.filter((mem) => {
      const idx = mem.map((k) => teams.findIndex((t) => t.some((m) => m.key === k))).filter((i) => i >= 0);
      return new Set(idx).size < idx.length;
    }).length;
    // 한 번의 시도: 묶음 먼저, 단독 인원은 포지션별로 인원 적은 팀에
    function once() {
      const teams = Array.from({ length: n }, () => []);
      const smallest = () => { const min = Math.min(...teams.map((t) => t.length)); const c = teams.filter((t) => t.length === min); return c[Math.floor(Math.random() * c.length)]; };
      shuffled(multi).forEach((g) => { const t = smallest(); shuffled(g).forEach((m) => t.push(m)); });
      TG_POS.concat('').forEach((pos) => shuffled(singles.filter((m) => (TG_POS.indexOf(m.position) >= 0 ? m.position : '') === pos)).forEach((m) => smallest().push(m)));
      return teams;
    }
    // 묶이지 않은 선수끼리 팀을 맞바꿔 보며 더 고른 배정을 찾는다 (팀 인원 수는 그대로). stop 을 주면 그만큼 좋아진 순간 멈춘다
    const free = {}; singles.forEach((p) => { free[p.key] = 1; });
    function improve(teams, stopV, stopS) {
      let bv = violations(teams), bs = score(teams);
      const done = () => stopS != null && bv <= stopV && bs <= stopS;
      for (let pass = 0; pass < 60 && !done(); pass++) {
        let improved = false;
        const pairs = [];
        for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++)
          for (let i = 0; i < teams[a].length; i++) for (let j = 0; j < teams[b].length; j++) pairs.push([a, i, b, j]);
        for (const [a, i, b, j] of shuffled(pairs)) {
          const x = teams[a][i], y = teams[b][j];
          if (!free[x.key] || !free[y.key]) continue;
          teams[a][i] = y; teams[b][j] = x;
          const v = violations(teams), s = score(teams);
          if (v < bv || (v === bv && s < bs - 1e-9)) { bv = v; bs = s; improved = true; if (done()) break; }
          else { teams[a][i] = x; teams[b][j] = y; }
        }
        if (!improved) break;
      }
      return { teams, v: bv, s: bs };
    }
    let best = null;
    const consider = (r) => { if (!best || r.v < best.v || (r.v === best.v && r.s < best.s)) best = { teams: r.teams.map((t) => t.slice()), v: r.v, s: r.s }; };
    if (!bySkill) {
      for (let k = 0; k < 80; k++) { const teams = once(); consider({ teams, v: violations(teams), s: score(teams) }); if (best.v === 0 && best.s === 0) break; }
    } else {
      for (let k = 0; k < 40; k++) consider(improve(once()));
      for (let k = 0; k < 30; k++) { const r = improve(once(), best.v, best.s + TG_SKILL_TOL); if (r.v <= best.v && r.s <= best.s + TG_SKILL_TOL) { best.teams = r.teams; break; } }
    }
    const teams = best.teams;
    shuffled(deferred).forEach((m) => {
      const minN = Math.min(...teams.map((t) => t.length));
      let pick = -1, pickScore = Infinity;
      teams.forEach((t, i) => { if (t.length !== minN) return; t.push(m); const s = score(teams); t.pop(); if (s < pickScore - 1e-9) { pickScore = s; pick = i; } });
      teams[pick].push(m);
    });
    teams.forEach((t) => t.sort(byPos));
    return { teams, violations: best.v };
  }
  /* YB vs OB: 올해 40세 이상이면 OB. 출생연도가 없는 사람(게스트 등)은 인원 적은 팀으로 */
  function buildYbOb(players) {
    const year = new Date().getFullYear();
    const teams = [[], []], unknown = [];
    players.forEach((p) => { const by = parseInt(p.birthYear, 10); if (!by) unknown.push(p); else teams[year - by >= 40 ? 1 : 0].push(p); });
    unknown.forEach((p) => teams[teams[0].length <= teams[1].length ? 0 : 1].push(p));
    teams.forEach((t) => t.sort(byPos));
    return { teams, unknown: unknown.length };
  }
  /* 팀 평균 실력 — 실력 점수가 없는 선수(게스트·기록 없는 팀원)는 빼고 계산 */
  function tgTeamSkillAvg(team) {
    const sk = S.tgSk, r = team.filter((m) => sk.map[m.key] != null);
    return r.length ? r.reduce((s, m) => s + sk.map[m.key], 0) / r.length : null;
  }
  function tgTeamSkillHtml(tg, team) {
    if (!tg.showSkill || !S.tgSk || !team.length) return '';
    const avg = tgTeamSkillAvg(team);
    if (avg == null) return '<div class="tg-skill">평균 실력 -</div>';
    const ex = team.filter((m) => S.tgSk.map[m.key] == null).length;
    const all = tg.result.map(tgTeamSkillAvg).filter((v) => v != null);
    const hi = Math.max(...all), lo = Math.min(...all);
    const mark = all.length >= 2 && hi - lo > TG_SKILL_GAP_WARN ? (avg === hi ? ' <b class="strong">(강한 팀)</b>' : (avg === lo ? ' <b class="weak">(약한 팀)</b>' : '')) : '';
    return '<div class="tg-skill">평균 실력 ' + avg.toFixed(1) + mark + (ex ? ' <span>(기록 없는 ' + ex + '명 제외)</span>' : '') + '</div>';
  }
  /* 실력 균형 배정 결과 위에 '어떤 규칙으로 나눴는지' 설명 */
  function tgSkillInfoHtml(tg) {
    if (!tg.skill) return '';
    return '<div class="tg-skill-info"><div class="hd">' + I.scale + ' 이렇게 나눴어요</div><ol>' +
      '<li><b>실력 점수</b>: 각자 <b>본인이 참석한 최근 ' + Stats.DAYS + '일</b> 경기 기록으로 계산합니다. <b>50점 ≈ 기록 있는 팀원 전체 평균</b>입니다.</li>' +
      '<li><b>점수 구성</b>: 효율 <b>50%</b> + 승률 <b>25%</b> + 수비 <b>25%</b>' +
      '<details data-keep="tgsk"' + (psState().open.tgsk ? ' open' : '') + '><summary>' + I.book + ' 효율·승률·수비는 어떤 지표?</summary><ul>' +
      '<li><b>효율</b>: 1게임 평균 (득점 + 리바운드 + 어시스트 + 스틸 + 블록 − 놓친 야투 − 놓친 자유투 − 턴오버). 많이 넣고 덜 놓치고 공을 덜 잃을수록 높습니다. <b>높을수록 좋음</b></li>' +
      '<li><b>승률</b>: 내가 뛴 게임에서 이긴 비율. <b>높을수록 좋음</b></li>' +
      '<li><b>수비</b>: 아래 두 가지를 반씩 봅니다.<br>· 스틸+블록 비율(STK%): 상대 공격 100번 중 내가 직접 끊거나 막은 비율. <b>높을수록 좋음</b><br>· 수비 효율(DRtg): 내가 뛴 게임에서 상대가 공격 100번에 낸 점수. <b>낮을수록 좋음</b></li>' +
      '</ul></details></li>' +
      '<li>기록이 없는 팀원·게스트는 실력 계산에서 빼고, 인원이 적은 팀으로 넣습니다. 같은 팀·다른 팀 조건은 그대로 지킵니다.</li></ol></div>';
  }
  /* ----- 회원·게스트 추가 -----
     회원 탭: 이 날 참석 체크하지 않은 팀원을 골라 넣는다 (여러 명). 기본은 정회원만, 게스트·휴식회원은 이름을 검색하면 나온다
     게스트 탭: 이름·포지션을 직접 적어 넣는다. 등록된 게스트 회원은 누르면 바로 추가 */
  function tgAddDialog(tab) {
    const t = S.team, tg = S.cache.tg;
    const ad = S.tgAdd = tab ? Object.assign(S.tgAdd, { tab }) : { tab: 'member', sel: new Set(), q: '' };
    const present = new Set(S.tgPool.map((p) => p.key));
    const cand = t.members.filter((m) => !present.has(m.userId)).map((m) => ({ key: m.userId, name: m.name, position: m.position, type: m.memberType })).sort(byPos);
    const tag = (m) => (m.type !== '정회원' ? ' <small>(' + esc(m.type) + ')</small>' : '');
    const btn = (m, on) => '<button data-k="' + esc(m.key) + '" class="' + (on ? 'on' : '') + '">' + (POS_LBL[m.position] || '-') + ' ' + esc(m.name) + tag(m) + '</button>';
    const tabBtn = (k, lb) => '<button data-tab="' + k + '" class="' + (ad.tab === k ? 'on' : '') + '">' + lb + '</button>';
    const body = ad.tab === 'member'
      ? '<input class="in" id="tgAddQ" placeholder="이름 검색 (게스트·휴식회원은 검색하면 나옵니다)" value="' + esc(ad.q) + '"><div class="pick mt12" id="tgAddList" style="max-height:44vh;overflow-y:auto"></div>'
      : '<label class="f">이름</label><input class="in" id="tgG" maxlength="20" placeholder="게스트 이름">' +
        '<label class="f">포지션</label><select class="in" id="tgGPos">' + Api.POSITIONS.map((x) => '<option>' + x + '</option>').join('') + '</select><div id="tgGSug"></div>';
    const bg = modal('<h3>회원·게스트 추가</h3><div class="seg" style="margin-bottom:12px">' + tabBtn('member', '회원') + tabBtn('guest', '게스트') + '</div>' + body +
      '<div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn" data-x="1" id="tgAddOk">추가</button></div>');
    bg.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => tgAddDialog(b.dataset.tab)));
    bg.querySelector('[data-x="0"]').onclick = closeModal;
    const addMembers = (keys) => { keys.forEach((k) => { if (!tg.added.includes(k)) tg.added.push(k); tg.off = tg.off.filter((x) => x !== k); }); tg.result = null; closeModal(); render(); };
    if (ad.tab === 'member') {
      const list = () => {
        const q = ad.q.trim();
        const show = cand.filter((m) => (q ? m.name.indexOf(q) >= 0 : m.type === '정회원'));
        $('#tgAddList').innerHTML = show.length ? show.map((m) => btn(m, ad.sel.has(m.key))).join('') : '<p class="empty">' + (q ? '검색 결과가 없습니다' : '추가할 정회원이 없습니다 (모두 참석)') + '</p>';
        $('#tgAddOk').textContent = ad.sel.size ? '추가 (' + ad.sel.size + '명)' : '추가';
        bg.querySelectorAll('#tgAddList button').forEach((b) => (b.onclick = () => { const k = b.dataset.k; if (ad.sel.has(k)) ad.sel.delete(k); else ad.sel.add(k); list(); }));
      };
      $('#tgAddQ').addEventListener('input', (e) => { ad.q = e.target.value; list(); });
      bg.querySelector('[data-x="1"]').onclick = () => { if (!ad.sel.size) { toast('추가할 회원을 선택하세요', 'error'); return; } addMembers([...ad.sel]); };
      list();
      return;
    }
    // 게스트 탭: 이름을 안 적었으면 등록된 게스트 전부, 적었으면 게스트·휴식회원 중 이름이 맞는 사람
    const sug = () => {
      const q = $('#tgG').value.trim();
      const show = cand.filter((m) => (q ? m.type !== '정회원' && m.name.indexOf(q) >= 0 : m.type === '게스트'));
      $('#tgGSug').innerHTML = show.length ? '<label class="f">' + (q ? '명단에 있는 사람' : '등록된 게스트') + ' (누르면 바로 추가)</label><div class="pick">' + show.map((m) => btn(m, false)).join('') + '</div>' : '';
      bg.querySelectorAll('#tgGSug button').forEach((b) => (b.onclick = () => addMembers([b.dataset.k])));
    };
    const add = () => {
      const n = $('#tgG').value.trim();
      if (!n) { toast('이름을 입력하세요', 'error'); return; }
      if (t.members.some((m) => m.name === n) || tg.guests.includes(n)) { toast(n + ' 은(는) 이미 명단에 있습니다', 'error'); return; }
      tg.guests.push(n); tg.guestPos[n] = $('#tgGPos').value; tg.result = null;
      closeModal(); render();
    };
    bg.querySelector('[data-x="1"]').onclick = add;
    $('#tgG').addEventListener('input', sug);
    $('#tgG').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    sug(); setTimeout(() => $('#tgG') && $('#tgG').focus(), 50);
  }
  function attendeesOf(a, dayId) { return (a.list || []).filter((x) => x.days.includes(dayId)).map((x) => x.userId); }

  /* ----- 선수 기록 · 선수 지표 · 선수 평가 (계산은 stats.js — 코모도 웹페이지와 같은 방식) ----- */
  const psState = () => S.cache.ps || (S.cache.ps = { sort: null, av: null, sel: '', open: {} });
  // 칸을 누르면 그 줄을 표시. 같은 선수(data-k)는 다른 표에서도 함께 표시
  const psTr = (key) => '<tr data-k="' + esc(key) + '"' + (key === psState().sel ? ' class="ps-sel"' : '') + '>';
  const psSub = (t) => '<small>' + t + '</small>';
  const psPct = (m, a) => (a > 0 ? Math.round(m / a * 100) + '%' : '-');
  const PS_ARW = { up: '<span class="ps-up">▲</span>', down: '<span class="ps-up ps-down">▼</span>' };
  const psNameCell = (p) => '<td class="ps-name"><button class="ps-nb" data-act="psPlayer" data-k="' + esc(p.key) + '">' + esc(p.name) + '</button></td>';
  const psDetails = (id, title, inner) => '<details class="ps-help" data-keep="' + id + '"' + (psState().open[id] ? ' open' : '') + '><summary>' + title + '</summary>' + inner + '</details>';
  function psSortVal(k) {
    if (k === 'games') return (p) => p.games;
    if (k === 'wl') return (p) => p.wins || 0;
    if (k === 'wr') return (p) => Stats.winRate(p);
    if (k && k.charAt(0) === 'c') { const c = Stats.VIEW[+k.slice(1)]; return c ? (p) => Stats.colVal(p, c) : null; }
    return null;
  }
  /* 합계(div=1) 또는 평균(div=나눌 값) 한 줄 */
  function psCells(totals, total, div, maxes) {
    const num = (v) => (div === 1 ? String(v || 0) : ((v || 0) / div).toFixed(1));
    return Stats.VIEW.map((c, i) => {
      let cls = c.t === 'pts' ? 'ps-pts' : '';
      if (maxes && maxes[i] != null) { const v = Stats.rawVal(totals, total, c); if (v > 0 && v >= maxes[i] - 1e-9) cls = (cls + ' ' + (Stats.isNeg(c) ? 'ps-bad' : 'ps-top')).trim(); }
      const txt = c.t === 'pts' ? num(total) : (c.t === 'pct' ? psPct(totals[Stats.IDX[c.m]], totals[Stats.IDX[c.a]]) : num(totals[Stats.IDX[c.k]]));
      return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + txt + '</td>';
    }).join('');
  }
  /* 4게임 기준 평균 한 줄 (상위 10% 색 + 지난주 대비 화살표) */
  function psSumCells(p, ths) {
    return Stats.VIEW.map((c, i) => {
      const v = Stats.colVal(p, c);
      const hot = ths[i] != null && v > 0 && v >= ths[i] - 1e-9;
      const cls = ((c.t === 'pts' ? 'ps-pts ' : '') + (hot ? (Stats.isNeg(c) ? 'ps-bad' : 'ps-top') : '')).trim();
      const txt = c.t === 'pct' ? psPct(p.totals[Stats.IDX[c.m]], p.totals[Stats.IDX[c.a]]) : v.toFixed(1);
      return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + txt + (PS_ARW[Stats.trend(p, c)] || '') + '</td>';
    }).join('');
  }
  /* tab: 'rec' = 선수 기록 표만, 'av' = 선수 지표 표만 (선수 기록 화면의 두 버튼), 없으면 둘 다 */
  function playerStatsHtml(t, games, tab) {
    const st = psState();
    const list = Stats.summary(games, t.members);
    S.psList = list;
    S.psEvals = t.isMember ? Stats.evals(list) : {}; // 선수 평가는 팀원에게만
    if (!list.length) return '<div class="card"><p class="empty">기록이 없습니다.</p></div>';
    const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
    const sv = psSortVal(st.sort);
    // 기본: 경기 수 많은 순 → 같으면 승률 높은 순 → 같으면 평균 득점순. 머리글을 누르면 그 항목이 높은 순
    const rows = list.slice().sort((a, b) => {
      if (st.sort === 'name') return byName(a, b);
      if (sv) { const d = sv(b) - sv(a); if (d) return d; }
      return (b.games - a.games) || (Stats.winRate(b) - Stats.winRate(a)) || (b.pts / b.games - a.pts / a.games) || byName(a, b);
    });
    const ths = Stats.thresholds(list);
    const winTh = Stats.topN(list.map((p) => Stats.winRate(p)));
    const th = (k, html, cls) => '<th class="' + (cls ? cls + ' ' : '') + 'ps-sort' + (st.sort === k ? ' on' : '') + '" data-act="psSort" data-v="' + k + '">' + html + (st.sort === k ? '<span class="ps-arw">▼</span>' : '') + '</th>';
    const head = '<tr>' + th('name', '선수', 'ps-name') + th('games', '경기') + th('wl', '승-패') + th('wr', 'W%' + psSub('승률')) +
      Stats.VIEW.map((c, i) => th('c' + i, c.code + psSub(c.ko))).join('') + '</tr>';
    const body = rows.map((p) => {
      const wr = Stats.winRate(p), pwr = p.prev ? Stats.winRate(p.prev) : -1;
      const up = wr >= 0 && pwr >= 0 && Math.round(wr * 100) > Math.round(pwr * 100);
      return psTr('n:' + p.key) + psNameCell(p) + '<td>' + p.games + '</td><td>' + Stats.winLabel(p) + '</td>' +
        '<td' + (winTh != null && wr > 0 && wr >= winTh - 1e-9 ? ' class="ps-top"' : '') + '>' + (wr < 0 ? '-' : Math.round(wr * 100) + '%') + (up ? PS_ARW.up : '') + '</td>' +
        psSumCells(p, ths) + '</tr>';
    }).join('');
    const D = Stats.DAYS, P = Stats.PER;
    if (tab === 'av') return '<div class="card">' + avTableHtml(rows, 'sum', true) + '</div>';
    return '<div class="card">' +
      '<p class="ps-note">선수마다 <b>본인이 참석한 최근 ' + D + '일</b>의 기록을 모아 <b>' + P + '게임 기준 평균</b>(1게임 평균 × ' + P + ')으로 계산합니다.</p>' +
      psDetails('note', '' + I.book + ' 표 보는 법', '<p class="ps-note">성공률·승률은 그대로입니다. <b>숫자 칸을 누르면 그 선수 줄이 노랗게 표시</b>됩니다. (다시 누르면 해제)<br>' +
        '<b>경기 수가 많은 순</b> → 같으면 <b>승률이 높은 순</b> → 같으면 <b>득점이 높은 순</b>으로 정렬되며, <b>표 머리글(항목)을 누르면 그 항목이 높은 순</b>으로 바뀝니다. (한 번 더 누르면 원래 순서)<br>' +
        '참석일 수는 선수마다 다르며, 마지막 참석이 오래전이어도 그 선수가 참석한 최근 ' + D + '일로 계산합니다. <b>게스트·휴식회원은 이 목록에서 빠집니다.</b><br>' +
        '<span class="ps-top ps-key">초록색</span> = 해당 항목 상위 10% · <span class="ps-bad ps-key">빨간색</span> = 턴오버·반칙 상위 10% (시도 개수는 제외)<br>' +
        PS_ARW.up + ' = 지난 일요일까지의 평균보다 이번 주 기록이 반영된 평균이 오른 항목 · ' + PS_ARW.down + ' = 턴오버·반칙이 줄었을 때<br>' +
        '승률은 같은 게임의 상대 팀 득점과 비교해 계산합니다.</p>') +
      '<div class="ps-wrap' + (tab ? ' ps-fix' : '') + '"><table class="ps-tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="ps-note mt8">선수 이름을 누르면 게임별 기록' + (t.isMember ? '과 선수 평가' : '') + '를 볼 수 있습니다.</p>' +
      (tab ? '' : avTableHtml(rows, 'sum')) + '</div>';
  }
  /* 선수 지표표 (players: 위 표와 같은 순서). fix = 표 안에서 스크롤하며 머리줄 고정 (선수 지표 버튼 화면) */
  function avTableHtml(players, where, fix) {
    const st = psState(), C = Stats.AV_COLS, sk = st['av_' + (where = where || 'sum')];
    const vals = C.map((c) => players.map((p) => Stats.avVal(p, c)));
    const ths = C.map((c, i) => Stats.avTop(vals[i], c.low));
    let rows = players.map((p, i) => ({ p, i }));
    const ci = sk ? C.findIndex((c) => c.k === sk) : -1;
    if (ci >= 0) rows.sort((a, b) => { // 높은 수치 순, DRtg(수비 효율)만 낮은 순
      const x = vals[ci][a.i], y = vals[ci][b.i];
      if (x == null || y == null) return (x == null) - (y == null) || a.i - b.i;
      return (C[ci].low ? x - y : y - x) || a.i - b.i;
    });
    const sc = ci >= 0 ? C[ci] : null;
    const info = sc ? '<div class="av-info"><div class="av-info-hd"><span class="av-tag av-' + sc.grp + '">' + sc.grp + '</span><b>' + sc.code + '</b> ' + sc.ko +
      '<button class="av-info-x" data-act="avSort" data-w="' + where + '" data-v="' + sc.k + '" aria-label="정렬 해제">✕</button></div>' +
      '<div><span class="av-info-lb">계산</span>' + sc.calc + '</div><div><span class="av-info-lb">의미</span>' + sc.mean + '</div><div><span class="av-info-lb">보는 법</span>' + sc.ref + '</div></div>' : '';
    const head = '<tr><th class="ps-name">선수</th><th>반영' + psSub('게임') + '</th>' + C.map((c) => {
      const on = sk === c.k;
      return '<th class="ps-sort av-' + c.grp + (on ? ' on' : '') + '" data-act="avSort" data-w="' + where + '" data-v="' + c.k + '">' + c.code + psSub(c.ko) + (on ? '<span class="ps-arw">' + (c.low ? '▲' : '▼') + '</span>' : '') + '</th>';
    }).join('') + '</tr>';
    const grpRow = '<tr class="av-grp"><th class="ps-name"></th><th></th><th colspan="3">공격</th><th colspan="3">수비</th><th>종합</th></tr>';
    const body = rows.map(({ p, i }) => psTr('n:' + p.key) + psNameCell(p) + '<td>' + (p.adv.g || 0) + '</td>' + C.map((c, k) => {
      const v = vals[k][i];
      const hot = ths[k] != null && v != null && (c.low ? v <= ths[k] + 1e-9 : v >= ths[k] - 1e-9) && (c.k !== 'net' || v > 0);
      return '<td' + (hot ? ' class="ps-top"' : (c.sign && v != null && v < 0 ? ' class="av-neg"' : '')) + '>' + Stats.avTxt(v, c) + '</td>';
    }).join('') + '</tr>').join('');
    const help = psDetails('av', '' + I.book + ' 지표 설명 보기', '<div class="ps-wrap"><table class="ps-tbl av-help-tbl"><thead><tr><th>구분</th><th>지표</th><th>계산</th><th>의미</th><th>보는 법</th></tr></thead><tbody>' +
      C.map((c) => '<tr><td>' + c.grp + '</td><td><b>' + c.code + '</b><br>' + c.ko + '</td><td class="av-l">' + c.calc + '</td><td class="av-l">' + c.mean + '</td><td class="av-l">' + c.ref + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="ps-note mt8">• 모든 지표는 <b>한 선수가 한 게임 내내 뛴다고 가정</b>합니다. 그래서 같은 게임의 우리 팀·상대 팀 기록을 그 선수가 코트에 있을 때의 기록으로 봅니다.<br>' +
      '• <b>반영 게임</b>은 상대 팀 기록까지 저장된 게임 수입니다. (TS%는 모든 게임으로 계산)<br>' +
      '• 공격 리바운드가 따로 기록되지 않아 공격 리바운드 뒤의 재공격도 공격 1번으로 셉니다. 모두 같은 기준이라 선수끼리 비교하는 데는 문제가 없습니다.<br>' +
      '• 반영 게임이 적으면 값이 크게 흔들립니다. 여러 날 쌓인 값을 보세요.</p>');
    return (fix ? '' : '<h2 class="mt16">' + I.chart + ' 선수 지표</h2>') + '<p class="ps-note">머리글을 누르면 높은 수치 순 + 그 지표 설명 · DRtg 는 낮은 순 · <span class="ps-top ps-key">초록색</span> = 좋은 쪽 상위 10%</p>' +
      help + info + '<div class="ps-wrap' + (fix ? ' ps-fix' : '') + '"><table class="ps-tbl av-tbl"><thead>' + grpRow + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  /* 선수 평가 카드 */
  function psEvalCard(e) {
    if (!e) return '';
    const li = (arr) => (arr && arr.length ? '<ul class="ev-ul">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
    return '<div class="ev-card"><div class="ev-hd"><span class="ev-type">' + esc(e.type) + '</span><span class="ev-date">' + esc(e.date) + ' 기준 · ' + e.games + '경기</span></div>' +
      '<p class="ev-line">' + esc(e.line) + '</p><div class="ev-cols">' +
      '<div><div class="ev-lb good">' + I.thumb + ' 강점</div>' + (li(e.good) || '<p class="ev-none">두드러진 항목 없음</p>') + '</div>' +
      '<div><div class="ev-lb bad">' + I.target + ' 보완점</div>' + (li(e.bad) || '<p class="ev-none">두드러진 항목 없음</p>') + '</div></div>' +
      (e.up && e.up.length ? '<div class="ev-lb up">' + I.trend + ' 지난주보다 좋아진 점</div>' + li(e.up) : '') +
      '<p class="ev-foot">본인이 참석한 최근 ' + Stats.DAYS + '일 기록을 다른 선수들과 비교해 자동으로 만든 평가입니다. 팀원에게만 보입니다.</p></div>';
  }
  /* ----- 관리 ----- */
  async function adminHtml(t) {
    const reqs = await Api.pendingRequests(t.id);
    return '<div class="card"><h2>' + I.userPlus + ' 가입 신청 ' + reqs.length + '건</h2>' + (reqs.length ? reqs.map((r) => '<div class="mem"><div class="no">' + initial(r.profile.name) + '</div><div class="grow"><div class="nm">' + esc(r.profile.name) + ' <span class="muted" style="font-weight:500">가입 이름: ' + esc(r.nickname) + '</span></div><div class="ds">' + esc([r.profile.position, r.profile.number ? r.profile.number + '번' : '', r.profile.birthYear ? r.profile.birthYear + '년생' : ''].filter(Boolean).join(' · ') || '추가 정보 없음') + (r.message ? '<br>“' + esc(r.message) + '”' : '') + '</div></div>' +
      '<button class="btn sm" data-act="reqOk" data-id="' + r.userId + '">수락</button><button class="btn gray sm" data-act="reqNo" data-id="' + r.userId + '">거절</button></div>').join('') : '<p class="empty">대기 중인 신청이 없습니다.</p>') + '</div>' +
      teamLinkCard(t) +
      '<div class="card"><h2>' + I.megaphone + ' 공지사항</h2><textarea class="in" id="admNotice" maxlength="2000" placeholder="팀원에게만 보이는 공지">' + esc(t.notice || '') + '</textarea><button class="btn block mt8" data-act="admNotice">공지 저장</button></div>' +
      '<div class="card"><h2>' + I.calendar + ' 농구하는 날</h2><div id="admDays">' + dayRowsHtml(t.days) + '</div><div class="row mt8"><button class="btn line sm" data-act="dayAdd">+ 요일 추가</button><button class="btn sm" style="margin-left:auto" data-act="admDays">요일 저장</button></div>' +
      '<button class="btn danger block mt12" data-act="admReset">이번 주 참석 체크 초기화</button><p class="muted mt8">주가 바뀌면(월요일) 참석 체크는 자동으로 새로 시작됩니다.</p></div>' +
      '<div class="card"><h2>' + I.check + ' 확인 항목</h2><p class="muted">팀원마다 체크할 항목입니다. (예: 회비 납부, 선수등록, 보험 가입, 유니폼 수령) 팀원에게만 보입니다.</p><div id="admChecks">' + checkRowsHtml(t.checkItems) + '</div>' +
      '<div class="row mt8"><button class="btn line sm" data-act="ckAdd">+ 항목 추가</button><button class="btn sm" style="margin-left:auto" data-act="ckSave">항목 저장</button></div></div>' +
      membersCard(t, true).replace('<h2>' + I.users + '', '<h2>' + I.users + ' 눌러서 관리 ·') +
      themeCardHtml(t) +
      '<div class="card"><h2>' + I.gear + ' 팀 정보</h2><label class="f">팀 이름</label><input class="in" id="admName" maxlength="30" value="' + esc(t.name) + '">' + logoField(S.cache.logo !== undefined ? S.cache.logo : t.logo) + logoOptsHtml(t) +
      '<label class="f">대한민국농구협회 등록 팀</label><select class="in" id="admKba"><option value="yes"' + (t.kba === 'yes' ? ' selected' : '') + '>예 — 협회에 등록된 팀</option><option value="no"' + (t.kba !== 'yes' ? ' selected' : '') + '>아니오 — 등록하지 않은 동호회</option></select>' +
      '<label class="f">지역</label><select class="in" id="admSido">' + Api.SIDO.map((s) => '<option' + (t.sido === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<label class="f">활동 지역·체육관</label><input class="in" id="admArea" maxlength="40" value="' + esc(t.area) + '">' +
      '<label class="f">팀 소개</label><textarea class="in" id="admIntro" maxlength="300">' + esc(t.intro) + '</textarea><button class="btn block mt8" data-act="admInfo">팀 정보 저장</button>' +
      (t.isOwner ? '<button class="btn danger block mt12" data-act="admDelete">팀 삭제</button>' : '') + '</div>';
  }
  /* 팀 색상 고르기 (고르면 바로 미리 보기, 저장해야 팀원 모두에게 적용) */
  function themeCardHtml(t) {
    const cur = S.cache.themeDraft || t.theme || DEF_THEME;
    return '<div class="card" id="thCard"><h2>' + I.shirt + ' 팀 색상</h2><p class="muted">팀 컬러에 맞춰 상단 바·버튼(<b>주 색</b>)과 아이콘·탭 밑줄·강조 표시(<b>강조 색</b>)를 바꿉니다. 저장하면 팀원 모두의 화면에 적용됩니다.</p>' +
      '<div class="theme-grid mt12">' + THEMES.map((x) => '<button class="theme-opt' + (cur.main === x[1] && cur.accent === x[2] ? ' on' : '') + '" data-act="thPick" data-m="' + x[1] + '" data-a="' + x[2] + '"><span class="th-sw"><i style="background:' + x[1] + '"></i><i style="background:' + x[2] + '"></i></span>' + esc(x[0]) + '</button>').join('') + '</div>' +
      '<div class="th-custom mt12"><label>주 색 <input type="color" id="thMain" value="' + esc(cur.main) + '"></label><label>강조 색 <input type="color" id="thAccent" value="' + esc(cur.accent) + '"></label></div>' +
      '<p class="muted mt8">직접 고를 수도 있습니다. 주 색을 흰색처럼 밝게 고르면 상단 바는 그 색 그대로 칠하고 글자를 어둡게 바꾸며, 버튼은 강조 색으로 칠합니다.</p>' +
      '<div class="row mt12"><button class="btn gray sm" data-act="thPick" data-m="' + DEF_THEME.main + '" data-a="' + DEF_THEME.accent + '">기본 색으로</button><button class="btn sm" style="margin-left:auto" data-act="thSave">색상 저장</button></div></div>';
  }
  function themePreview(th) {
    S.cache.themeDraft = th; applyTheme(th);
    document.querySelectorAll('#thCard .theme-opt').forEach((b) => b.classList.toggle('on', b.dataset.m === th.main && b.dataset.a === th.accent));
    const m = $('#thMain'), a = $('#thAccent'); if (m) m.value = th.main; if (a) a.value = th.accent;
  }
  const checkRowsHtml = (items) => items.map((c) => '<div class="row mt8" data-ck-row="' + esc(c.id || '') + '"><input class="in" maxlength="12" placeholder="항목 이름" value="' + esc(c.label || '') + '"><button class="btn gray sm" data-act="ckDel">✕</button></div>').join('') || '<p class="empty">항목이 없습니다.</p>';
  const readChecks = () => [...document.querySelectorAll('#admChecks [data-ck-row]')].map((r) => ({ id: r.dataset.ckRow, label: r.querySelector('input').value }));
  function memberDialog(userId) {
    const t = S.team;
    const m = t.members.find((x) => x.userId === userId);
    if (!m) return;
    const isMe = S.user && S.user.id === userId;
    const bg = modal('<h3>' + esc(m.name) + ' <span class="chip">' + ROLE[m.role] + '</span></h3>' + profileFields(m, 'md') +
      '<label class="f">회원 구분</label><select class="in" id="mdType">' + Api.MEMBER_TYPES.map((x) => '<option' + (m.memberType === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
      (t.checkItems.length ? '<label class="f">확인 항목</label><div class="row" style="flex-wrap:wrap;gap:6px 16px">' + t.checkItems.map((c) => '<label class="row"><input type="checkbox" data-ck="' + esc(c.id) + '"' + (m.checks[c.id] ? ' checked' : '') + '> ' + esc(c.label) + '</label>').join('') + '</div>' : '') +
      (t.isOwner && m.role !== 'owner' ? '<label class="f">역할</label><div class="seg" id="mdRole"><button data-v="member" class="' + (m.role === 'member' ? 'on' : '') + '">팀원</button><button data-v="admin" class="' + (m.role === 'admin' ? 'on' : '') + '">관리자</button></div>' : '') +
      '<div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn" data-x="1">저장</button></div>' +
      (!isMe && m.role !== 'owner' ? '<div class="row mt12">' + (t.isOwner ? '<button class="btn line sm grow" data-x="owner">대표 넘기기</button>' : '') + '<button class="btn danger sm grow" data-x="kick">팀에서 내보내기</button></div>' : ''));
    let role = m.role;
    bg.querySelectorAll('#mdRole button').forEach((b) => (b.onclick = () => { role = b.dataset.v; bg.querySelectorAll('#mdRole button').forEach((x) => x.classList.toggle('on', x === b)); }));
    bg.querySelector('[data-x="0"]').onclick = closeModal;
    bg.querySelector('[data-x="1"]').onclick = async () => {
      const patch = Object.assign(readProfile('md'), { memberType: $('#mdType').value, checks: [...bg.querySelectorAll('[data-ck]')].reduce((o, c) => { o[c.dataset.ck] = c.checked; return o; }, {}) });
      if (t.isOwner && m.role !== 'owner' && role !== m.role) patch.role = role;
      await run(Api.updateMember(t.id, userId, patch), '저장했습니다'); closeModal(); render();
    };
    const ow = bg.querySelector('[data-x="owner"]');
    if (ow) ow.onclick = async () => { if (await confirmBox('대표 넘기기', esc(m.name) + ' 님에게 대표를 넘깁니다. 나는 관리자가 됩니다.', '넘기기')) { await run(Api.transferOwner(t.id, userId), '대표를 넘겼습니다'); render(); } };
    const kk = bg.querySelector('[data-x="kick"]');
    if (kk) kk.onclick = async () => { if (await confirmBox('팀에서 내보내기', esc(m.name) + ' 님을 팀에서 내보냅니다.', '내보내기', true)) { await run(Api.removeMember(t.id, userId), '내보냈습니다'); render(); } };
  }

  /* =========================================================
   *  내 정보
   * ========================================================= */
  async function meHtml() {
    S.mems = await Api.myMemberships();
    const u = S.user;
    const st = { active: '', pending: '<span class="chip orange">승인 대기</span>' };
    return barHtml('내 정보', false) + '<main>' +
      '<div class="card"><div class="row"><div class="no" style="width:48px;height:48px;border-radius:50%;background:var(--green-light);color:var(--green);display:flex;align-items:center;justify-content:center;font-weight:800">' + initial(u.nickname) + '</div><div class="grow"><div style="font-weight:800">' + esc(u.nickname) + '</div><div class="muted">' + (u.provider === 'nick' ? '아이디 <b>' + esc(u.loginId || u.nickname) + '</b> 로 로그인' : (PROVIDER[u.provider] || '카카오') + ' 계정으로 로그인') + (Api.mode === 'local' ? ' (체험)' : '') + '</div></div></div></div>' +
      '<div class="card"><h2>' + I.ball + ' 내 팀</h2>' + (S.mems.length ? S.mems.map((m) => '<div class="mem">' + teamAv(m.teamLogo, m.teamName, 'sm') + '<button class="grow" style="text-align:left" data-act="openTeam" data-id="' + m.teamId + '"><div class="row"><span class="nm">' + esc(m.teamName) + '</span>' + (m.status === 'active' ? '<span class="chip gray">' + ROLE[m.role] + '</span>' : '') + (st[m.status] || '') + (m.primary ? '<span class="chip">★ 기본</span>' : '') + '</div><div class="ds">' + esc(m.sido) + '</div></button>' +
        (m.status === 'active' && !m.primary ? '<button class="btn line sm" data-act="setPrimary" data-id="' + m.teamId + '">기본 팀</button>' : '') +
        (m.status === 'active' ? '<button class="btn gray sm" data-act="leaveTeam" data-id="' + m.teamId + '">탈퇴</button>' : '<button class="btn gray sm" data-act="cancelJoinId" data-id="' + m.teamId + '">취소</button>') + '</div>').join('') : '<p class="empty">아직 소속된 팀이 없습니다.</p>') +
      '<button class="btn line block mt12" data-act="navExplore">' + I.search + ' 팀 찾기 · 만들기</button></div>' +
      '<div class="card"><h2>' + I.info + ' 앱 정보</h2><div class="mem"><span class="grow">버전</span><span class="muted">' + VERSION + (Api.mode === 'local' ? ' (체험판)' : '') + '</span></div>' +
      '<a class="mem" href="' + PRIVACY_URL + '" target="_blank" style="color:inherit;text-decoration:none"><span class="grow">개인정보처리방침</span><span class="muted">›</span></a>' +
      (Api.mode === 'local' ? '<button class="mem" data-act="resetDemo"><span class="grow">체험 데이터 처음으로 되돌리기</span><span class="muted">›</span></button>' : '') + '</div>' +
      '<button class="btn gray block" data-act="logout">로그아웃</button>' +
      '<button class="btn danger block mt12" data-act="deleteAccount">회원 탈퇴</button>' +
      '<p class="muted mt8" style="text-align:center">탈퇴하면 소속·참석 기록이 지워지고, 게시글과 경기 기록의 이름은 \'탈퇴 회원\'으로 바뀝니다.</p></main>';
  }

  /* =========================================================
   *  동작
   * ========================================================= */
  const A = {
    back: () => { if (!back()) home(); },
    closeModal,
    loginKakao: () => mockLogin('kakao'),
    loginApple: () => mockLogin('apple'),
    loginGoogle: () => mockLogin('google'),
    loginNick: async () => { await run(Api.login('nick', $('#lgId').value.trim().toLowerCase(), $('#lgPw').value, false)); await boot(); },
    loginMode: (el) => { S.loginMode = el.dataset.v; render(); setTimeout(() => $('#lgId') && $('#lgId').focus(), 30); },
    signupNick: async () => {
      const id = $('#lgId').value.trim().toLowerCase(), pw = $('#lgPw').value, name = $('#lgName').value.trim();
      if (!/^[a-z0-9_]{4,20}$/.test(id)) { toast('아이디는 영문 소문자·숫자 4~20자로 정하세요', 'error'); $('#lgId').focus(); return; }
      if (pw.length < 4) { toast('비밀번호는 4자 이상으로 정하세요', 'error'); return; }
      if (pw !== $('#lgPw2').value) { toast('비밀번호 확인이 맞지 않습니다', 'error'); return; }
      if (!name) { toast('이름(실명)을 입력하세요', 'error'); $('#lgName').focus(); return; }
      // 아이디는 nickname 자리로 보낸다 (서버가 계정 열쇠로 씀). 실명·기본 정보는 extra 로
      await run(Api.login('nick', id, pw, true, { name, position: $('#lgPos').value, number: $('#lgNo').value, birthYear: $('#lgBy').value }), '가입했습니다');
      S.loginMode = 'in'; await boot();
    },
    copyLink: async () => {
      const url = teamLink(S.team.id);
      try { await navigator.clipboard.writeText(url); toast('주소를 복사했습니다. 카톡에 붙여 넣으세요', 'success'); }
      catch (e) { modal('<h3>' + I.link + ' 팀 링크</h3><p class="muted">아래 주소를 길게 눌러 복사하세요.</p><textarea class="in" readonly style="min-height:90px">' + esc(url) + '</textarea><div class="acts"><button class="btn" data-act="closeModal">닫기</button></div>'); }
    },
    shareLink: async () => {
      const t = S.team, url = teamLink(t.id);
      const text = '[' + t.name + '] 참석 체크 · 경기 기록\n앱이 없어도 이 주소에서 로그인하면 바로 참석 체크할 수 있어요.';
      if (navigator.share) { try { await navigator.share({ title: t.name + ' · 나의 농구팀', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(text + '\n' + url); toast('안내 문구와 주소를 복사했습니다. 카톡에 붙여 넣으세요', 'success'); }
      catch (e) { A.copyLink(); }
    },
    memSort: (el) => { const ms = S.cache.memSort; if (ms.k === el.dataset.v) ms.desc = !ms.desc; else { ms.k = el.dataset.v; ms.desc = false; } render(); },
    thPick: (el) => themePreview({ main: el.dataset.m, accent: el.dataset.a }),
    thSave: async () => {
      const d = S.cache.themeDraft || S.team.theme || DEF_THEME;
      const theme = d.main === DEF_THEME.main && d.accent === DEF_THEME.accent ? null : { main: d.main, accent: d.accent };
      await run(Api.updateTeam(S.team.id, { theme }), '팀 색상을 저장했습니다'); S.cache.themeDraft = null; render();
    },
    navHome: () => home(),
    navExplore: () => go({ page: 'explore' }),
    navMe: () => go({ page: 'me' }),
    goCreate: () => { S.cache.newDays = null; S.cache.logo = undefined; go({ page: 'create' }); },
    logoClear: () => { S.cache.logo = ''; const p = $('#logoPrev'); if (p) p.innerHTML = '<span class="muted">없음</span>'; const cb = $('#logoCropBtn'); if (cb) cb.hidden = true; logoPreview(); },
    logoCrop: () => { // 이번에 고른 원본이 있으면 원본으로, 없으면 지금 로고로 다시 조정
      const cur = S.cache.logo !== undefined ? S.cache.logo : (S.route.page === 'team' && S.team ? S.team.logo : '');
      const src = S.cache.logoSrc && S.cache.logoSrc.out === cur ? S.cache.logoSrc.src : cur;
      if (src) logoCropper(src);
    },
    exSido: (el) => { S.cache.ex.sido = el.dataset.v; render(); },
    openTeam: (el) => go({ page: 'team', teamId: el.dataset.id, tab: '' }),
    tab: (el) => { if (Api.refresh) Api.refresh(el.dataset.v === S.route.tab ? 0 : 5000); S.route.tab = el.dataset.v; S.cache.logo = undefined; S.cache.logoStyle = null; S.cache.themeDraft = null; render(); window.scrollTo(0, 0); }, // 탭을 옮기면 5초 넘은 자료는, 같은 탭을 다시 누르면 무조건 서버에서 새로 받는다
    switchTeam: () => {
      const act = S.mems.filter((m) => m.status === 'active');
      const bg = modal('<h3>팀 바꾸기</h3>' + act.map((m) => '<button class="team-card" data-id="' + m.teamId + '">' + teamAv(m.teamLogo, m.teamName) + '<div class="grow"><div class="nm">' + esc(m.teamName) + (m.primary ? ' <span class="chip">★ 기본</span>' : '') + '</div><div class="ds">' + esc(m.sido) + ' · ' + ROLE[m.role] + '</div></div></button>').join('') + '<p class="muted">앱을 열면 ★ 기본 팀이 먼저 나옵니다. 내 정보에서 바꿀 수 있습니다.</p>');
      bg.querySelectorAll('.team-card').forEach((b) => (b.onclick = () => { closeModal(); S.cache = { ex: S.cache.ex }; go({ page: 'team', teamId: b.dataset.id, tab: 'attend' }, true); }));
    },
    dayAdd: () => {
      const box = $('#crDays') || $('#admDays');
      const days = readDays(box); days.push({ weekday: 6, time: '10:00', end: '12:00', place: '' });
      box.innerHTML = dayRowsHtml(days);
    },
    dayDel: (el) => {
      const box = el.closest('#crDays,#admDays');
      const days = readDays(box); days.splice(+el.dataset.i, 1);
      box.innerHTML = dayRowsHtml(days);
    },
    createTeam: async () => {
      const data = { name: $('#crTeamName').value, sido: $('#crSido').value, area: $('#crArea').value, intro: $('#crIntro').value, days: readDays($('#crDays')), profile: readProfile('cr'), kba: $('#crKba').value, logo: S.cache.logo || '' };
      if (!data.kba) { toast('대한민국농구협회 등록 팀인지 선택하세요', 'error'); return; }
      if (!data.profile.name.trim()) { toast('대표 이름을 입력하세요', 'error'); return; }
      const r = await run(Api.createTeam(data), '팀을 만들었습니다');
      S.cache.logo = undefined;
      S.stack = []; go({ page: 'team', teamId: r.id, tab: 'admin' }, true);
    },
    joinDlg: () => {
      const bg = modal('<h3>' + esc(S.team.name) + ' 가입 신청</h3>' + profileFields(null, 'jn') + '<label class="f">하고 싶은 말 (대표·관리자에게만 보임)</label><input class="in" id="jnMsg" maxlength="200" placeholder="예: 지인 소개로 왔습니다">' +
        '<div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn" data-x="1">신청 보내기</button></div>');
      bg.querySelector('[data-x="0"]').onclick = closeModal;
      bg.querySelector('[data-x="1"]').onclick = async () => { await run(Api.requestJoin(S.team.id, readProfile('jn'), $('#jnMsg').value), '가입 신청을 보냈습니다'); closeModal(); render(); };
    },
    cancelJoin: async () => { if (await confirmBox('신청 취소', '가입 신청을 취소할까요?', '취소하기')) { await run(Api.cancelJoin(S.team.id), '취소했습니다'); render(); } },
    cancelJoinId: async (el) => { if (await confirmBox('신청 취소', '가입 신청을 취소할까요?', '취소하기')) { await run(Api.cancelJoin(el.dataset.id), '취소했습니다'); render(); } },
    attPick: (el) => {
      const p = S.cache.attPick; const id = el.dataset.id;
      S.cache.attCmt = $('#attCmt').value; S.cache.attCmtTeam = S.team.id;
      if (id === 'none') p.days = p.days.includes('none') ? [] : ['none'];
      else { p.days = p.days.filter((x) => x !== 'none'); p.days = p.days.includes(id) ? p.days.filter((x) => x !== id) : p.days.concat(id); }
      vibrate(10); render();
    },
    // 참석 탭 접기·펼치기 (다시 불러오지 않고 그 칸만 바꾼다)
    attNotice: (el) => {
      const ui = S.cache.attUi; ui.notice = !ui.notice;
      el.classList.toggle('clamp', !ui.notice);
      const f = el.querySelector('.fold-more'); if (f) f.textContent = ui.notice ? '접기 ▴' : '더보기 ▾';
    },
    attDay: (el) => {
      const ui = S.cache.attUi; ui.sel = ui.sel === el.dataset.id ? '' : el.dataset.id;
      const c = $('.att .cnt'); if (c && S.att) c.outerHTML = countCard(S.team, S.att, ui);
      vibrate(10);
    },
    attGoStatus: () => {
      const ui = S.cache.attUi; if (!ui || !ui.sel) return;
      S.cache.stFocus = ui.sel; A.tab({ dataset: { v: 'status' } });
    },
    attChat: () => {
      const ui = S.cache.attUi; ui.chat = !ui.chat;
      const c = $('#kkCard'); if (!c) return;
      c.classList.toggle('open', ui.chat);
      if (ui.chat) { const k = c.querySelector('.kk'); k.scrollTop = k.scrollHeight; k.removeAttribute('data-act'); } else c.querySelector('.kk').setAttribute('data-act', 'attChat');
    },
    attChatWrite: () => {
      S.cache.attUi.write = true;
      const c = $('.att .kk-card'); if (c && S.att) c.outerHTML = chatCard(S.team, S.att, S.cache.attUi);
      const i = $('#kkIn'); if (i) i.focus();
    },
    attChatSend: async () => {
      const txt = $('#kkIn').value.trim(), a = S.att;
      if (!txt) { toast('한마디를 입력하세요', 'error'); return; }
      if (a && a.mine) { // 참석 체크를 이미 했으면 한마디만 바꿔 저장
        await run(Api.submitAttendance(S.team.id, a.mine.days, txt), '한마디를 남겼습니다');
        S.cache.attPick = null; S.cache.attCmt = null; render();
        return;
      }
      // 아직 참석 체크 전: 참석 체크를 펼치고 입력한 말을 옮겨 둔다
      S.cache.attUi.open = true; S.cache.attCmt = txt; S.cache.attCmtTeam = S.team.id;
      await render();
      const f = $('#ckf'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('참석 가능일을 고르고 제출하면 한마디도 함께 올라갑니다');
    },
    attFold: () => {
      const ui = S.cache.attUi; ui.open = !ui.open;
      const f = $('#ckf'); if (f) f.classList.toggle('open', ui.open);
    },
    attSubmit: async () => {
      await run(Api.submitAttendance(S.team.id, S.cache.attPick.days, $('#attCmt').value), '제출했습니다');
      S.cache.attPick = null; S.cache.attCmt = null; S.cache.tg = null; render(); // 팀 편성 참가자도 새 참석으로 다시 채움
    },
    myProfile: () => {
      const p = S.team.my.profile;
      const bg = modal('<h3>이 팀에서의 내 정보</h3>' + profileFields(p, 'mp') + '<p class="muted mt8">확인 항목(회비 등)과 회원 구분은 관리자가 바꿉니다.</p><div class="acts"><button class="btn gray" data-x="0">취소</button><button class="btn" data-x="1">저장</button></div>');
      bg.querySelector('[data-x="0"]').onclick = closeModal;
      bg.querySelector('[data-x="1"]').onclick = async () => { await run(Api.updateMember(S.team.id, S.user.id, readProfile('mp')), '저장했습니다'); closeModal(); render(); };
    },
    postAdd: async () => { await run(Api.addPost(S.team.id, $('#postBody').value), '올렸습니다'); render(); },
    postDel: async (el) => { if (await confirmBox('글 삭제', '이 글을 지울까요?', '삭제', true)) { await run(Api.deletePost(S.team.id, el.dataset.id)); render(); } },
    cmtAdd: async (el) => { await run(Api.addComment(S.team.id, el.dataset.id, $('#cm_' + el.dataset.id).value)); render(); },
    cmtDel: async (el) => { if (await confirmBox('댓글 삭제', '이 댓글을 지울까요?', '삭제', true)) { await run(Api.deleteComment(S.team.id, el.dataset.p, el.dataset.id)); render(); } },
    tgDay: (el) => { const tg = S.cache.tg; tg.day = el.dataset.id; tg.off = []; tg.result = null; tg.savedDate = ''; render(); },
    tgToggle: (el) => { const tg = S.cache.tg, k = el.dataset.k; tg.off = tg.off.includes(k) ? tg.off.filter((x) => x !== k) : tg.off.concat(k); render(); }, // 누르면 제외, 다시 누르면 포함
    tgCount: (el) => {
      const tg = S.cache.tg;
      tg.mode = el.dataset.m; if (tg.mode === 'num') tg.count = +el.dataset.v;
      tg.diff = tg.diff.map((mem) => mem.slice(0, tgCount(tg))); // 다른 팀 조건은 팀 수만큼까지
      tg.result = null; render();
    },
    tgGuest: () => tgAddDialog(),
    tgcAdd: (el) => { S.cache.tg[el.dataset.kind].push(['', '']); render(); },
    tgcAddM: (el) => { const mem = S.cache.tg[el.dataset.kind][+el.dataset.r]; if (mem) mem.push(''); render(); },
    tgcDel: (el) => { S.cache.tg[el.dataset.kind].splice(+el.dataset.r, 1); render(); },
    tgBuild: () => tgRun(false),
    tgSkill: () => tgRun(true),
    tgMove: (el) => {
      const r = S.cache.tg.result, k = el.dataset.k;
      const from = r.findIndex((team) => team.some((p) => p.key === k));
      const p = r[from].find((x) => x.key === k);
      r[from] = r[from].filter((x) => x.key !== k); r[(from + 1) % r.length].push(p); render();
    },
    tgCopy: async () => {
      const tg = S.cache.tg;
      const txt = tg.result.map((team, i) => tgLabel(tg, i) + '팀 (' + team.length + '명)\n' + team.map((p) => '- ' + p.name + (p.position ? ' (' + p.position + ')' : '')).join('\n')).join('\n\n');
      try { await navigator.clipboard.writeText(txt); toast('복사했습니다. 단톡방에 붙여 넣으세요', 'success'); } catch (e) { modal('<h3>복사할 내용</h3><textarea class="in" style="min-height:220px">' + esc(txt) + '</textarea><div class="acts"><button class="btn" data-act="closeModal">닫기</button></div>'); }
    },
    tgSave: async () => {
      const tg = S.cache.tg, t = S.team;
      const day = t.days.find((d) => d.id === tg.day) || {};
      const date = tgTargetDate(t, tg);
      const teams = tg.result.map((team, i) => ({ label: tgLabel(tg, i), color: TEAM_COLORS[i % 4], members: team.map((p) => ({ key: p.key, name: p.name, position: p.position, guest: p.guest })) }));
      const r = await run(Api.saveLineup(t.id, { date, dayId: tg.day, day: day.title || '', teams }));
      tg.savedDate = date; // 이후 재저장도 같은 날짜를 수정하도록
      render();
      const bg = modal('<h3>' + I.check + ' 저장 완료</h3><p class="muted">' + esc(date + ' 팀 배정 (' + r.count + '명)') + '</p>' +
        '<p class="muted mt8">' + I.note + ' 기록 입력에서 이 날을 누르면 이 팀을 불러옵니다.<br>같은 날짜로 다시 저장하면 기존 내용이 수정됩니다.</p>' +
        '<div class="acts"><button class="btn gray" data-act="closeModal">확인</button><button class="btn" data-x="rs">' + I.note + ' 기록 입력 열기</button></div>');
      bg.querySelector('[data-x="rs"]').onclick = async () => { closeModal(); S.route.tab = 'games'; await render(); A.rsOpen(); };
    },
    // 그 요일로 가장 나중에 저장된 배정을 불러와 고친다
    tgLoad: async () => {
      const tg = S.cache.tg, t = S.team;
      const r = await run(Api.getLineup(t.id, { dayId: tg.day }));
      if (!r || !r.teams.length) { toast('이 요일로 저장된 팀이 없습니다', 'error'); return; }
      const labels = r.teams.map((x) => x.label);
      tg.mode = labels.includes('YB') && labels.includes('OB') ? 'ybob' : 'num';
      if (tg.mode === 'num') tg.count = Math.min(4, Math.max(2, r.teams.length));
      const mem = {}; t.members.forEach((m) => { mem[m.userId] = m; });
      tg.result = r.teams.map((x) => x.members.map((m) => {
        const k = mem[m.key];
        if (k) { if (!tg.added.includes(m.key)) tg.added.push(m.key); return { key: m.key, name: k.name, position: k.position, guest: false, birthYear: k.birthYear }; }
        if (!tg.guests.includes(m.name)) tg.guests.push(m.name); // 팀원 명단에 없으면 게스트로
        tg.guestPos[m.name] = m.position || '';
        return { key: 'g:' + m.name, name: m.name, position: m.position || '', guest: true };
      }));
      while (tg.result.length < tgCount(tg)) tg.result.push([]);
      const inTeam = new Set(tg.result.reduce((v, x) => v.concat(x.map((p) => p.key)), []));
      tg.off = tg.off.filter((k) => !inTeam.has(k));
      tg.skill = false; tg.savedDate = r.date; render();
      toast(r.date + ' 팀을 불러왔습니다', 'success');
    },
    reqOk: async (el) => { await run(Api.decideJoin(S.team.id, el.dataset.id, true), '수락했습니다'); render(); },
    reqNo: async (el) => { if (await confirmBox('가입 거절', '이 신청을 거절할까요?', '거절', true)) { await run(Api.decideJoin(S.team.id, el.dataset.id, false), '거절했습니다'); render(); } },
    admNotice: async () => { await run(Api.updateTeam(S.team.id, { notice: $('#admNotice').value }), '공지를 저장했습니다'); render(); },
    admDays: async () => { await run(Api.updateTeam(S.team.id, { days: readDays($('#admDays')) }), '요일을 저장했습니다'); S.cache.tg = null; render(); },
    admReset: async () => { if (await confirmBox('참석 체크 초기화', '이번 주에 팀원들이 제출한 참석 체크와 한마디를 모두 지웁니다.', '초기화', true)) { await run(Api.resetWeek(S.team.id), '초기화했습니다'); render(); } },
    admInfo: async () => {
      const patch = { name: $('#admName').value, sido: $('#admSido').value, area: $('#admArea').value, intro: $('#admIntro').value, kba: $('#admKba').value };
      if (S.cache.logo !== undefined) patch.logo = S.cache.logo;
      if (S.cache.logoStyle || patch.logo !== undefined) {
        const st = Object.assign({}, logoStyleOf(S.team));
        st.bg = await logoBgColor(patch.logo !== undefined ? patch.logo : S.team.logo); // 로고가 바뀌었을 수 있으니 저장할 때 다시 잰다
        patch.logoStyle = st;
      }
      await run(Api.updateTeam(S.team.id, patch), '저장했습니다'); S.cache.logo = undefined; S.cache.logoStyle = null; render();
    },
    ckAdd: () => { const v = readChecks(); v.push({ id: '', label: '' }); $('#admChecks').innerHTML = checkRowsHtml(v); const ins = document.querySelectorAll('#admChecks input'); ins[ins.length - 1].focus(); },
    ckDel: (el) => { const row = el.closest('[data-ck-row]'), v = readChecks(), i = [...document.querySelectorAll('#admChecks [data-ck-row]')].indexOf(row); v.splice(i, 1); $('#admChecks').innerHTML = checkRowsHtml(v); },
    ckSave: async () => {
      const v = readChecks().filter((c) => c.label.trim());
      await run(Api.updateTeam(S.team.id, { checkItems: v }), '확인 항목을 저장했습니다'); render();
    },
    admDelete: async () => {
      if (!(await confirmBox('팀 삭제', '<b>' + esc(S.team.name) + '</b> 팀과 참석·팀 편성·경기 기록이 모두 지워집니다. 되돌릴 수 없습니다.', '삭제', true))) return;
      await run(Api.deleteTeam(S.team.id), '팀을 삭제했습니다'); S.cache = {}; home();
    },
    memDlg: (el) => memberDialog(el.dataset.id),
    setPrimary: async (el) => { await run(Api.setPrimary(el.dataset.id), '기본 팀으로 정했습니다'); render(); },
    leaveTeam: async (el) => { if (await confirmBox('팀 탈퇴', '이 팀에서 나갈까요? 참석 기록도 지워집니다.', '탈퇴', true)) { await run(Api.leaveTeam(el.dataset.id), '탈퇴했습니다'); render(); } },
    resetDemo: async () => { if (await confirmBox('체험 데이터 되돌리기', '이 기기에 저장된 체험 데이터를 모두 지우고 예시 팀으로 되돌립니다. 다시 로그인해야 합니다.', '되돌리기', true)) { await Api.resetDemo(); Ext.clearDraft(); S.cache = {}; boot(); } },
    logout: async () => { if (await confirmBox('로그아웃', '로그아웃할까요?', '로그아웃')) { await Api.logout(); S.cache = {}; boot(); } },
    deleteAccount: async () => {
      if (!(await confirmBox('회원 탈퇴', '계정과 모든 팀 소속, 참석 기록이 지워집니다. 내가 대표인 팀은 다른 팀원에게 대표가 넘어가고, 혼자인 팀은 삭제됩니다. 되돌릴 수 없습니다.', '탈퇴하기', true))) return;
      await run(Api.deleteAccount(), '탈퇴했습니다'); S.cache = {}; Ext.clearDraft(); boot();
    }
  };
  /* 팀 나누기 실행 (bySkill = 실력 균형 배정) */
  function tgRun(bySkill) {
    const tg = S.cache.tg, sk = S.tgSk;
    const players = (S.tgPool || []).filter((p) => !tg.off.includes(p.key));
    const n = tgCount(tg);
    if (players.length < n * 2) { toast('팀마다 2명 이상 필요합니다', 'error'); return; }
    if (tg.mode === 'ybob') {
      const r = buildYbOb(players);
      tg.result = r.teams; tg.skill = false; vibrate(30); render();
      if (r.unknown) toast('출생연도가 없는 ' + r.unknown + '명은 인원 적은 팀으로 넣었습니다. 이름을 눌러 옮기세요');
      return;
    }
    if (bySkill && !players.some((p) => sk.map[p.key] != null)) { toast('저장된 경기 기록이 없어 실력을 계산할 수 없습니다', 'error'); return; }
    const r = buildTeamsEx(players, n, { sk, bySkill, same: tg.same, diff: tg.diff });
    tg.result = r.teams; tg.skill = bySkill; if (bySkill) tg.showSkill = true;
    vibrate(30); render();
    const noRec = bySkill ? players.filter((p) => sk.map[p.key] == null).length : 0;
    if (r.violations) toast('일부 다른 팀 조건을 만족하지 못했습니다', 'error');
    else if (bySkill) toast('실력 균형 배정 완료' + (noRec ? ' · 기록 없는 ' + noRec + '명은 인원 적은 팀으로' : ''), 'success');
  }
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'logoIn' || !e.target.files || !e.target.files[0]) return;
    // 고른 그림은 바로 자르지 않고 자르기 창을 띄운다 (잘릴 부분·크기를 직접 맞춤)
    const fr = new FileReader(), inp = e.target;
    fr.onload = () => { inp.value = ''; logoCropper(fr.result); };
    fr.onerror = () => toast('그림을 읽지 못했습니다', 'error');
    fr.readAsDataURL(inp.files[0]);
  });
  // 로고 설정: 고르면 상단 바 미리 보기. '로고 배경색과 하나로'를 처음 고르면 배경색을 잰다
  document.addEventListener('change', (e) => {
    if (!e.target.matches || !e.target.matches('[data-lg]')) return;
    logoPreview();
    const st = S.cache.logoStyle;
    if (st && st.blend) {
      const src = S.cache.logo !== undefined ? S.cache.logo : S.team.logo;
      if (!src) { toast('먼저 팀 로고를 고르세요', 'error'); return; }
      logoBgColor(src).then((bg) => {
        st.bg = bg; logoPreview();
        const n = $('#lgNote'); if (n) n.innerHTML = '로고 배경색<span class="lg-bg" style="background:' + esc(bg) + '"></span> 으로 상단 바를 칠합니다. <b>팀 정보 저장</b>을 눌러야 적용됩니다.';
      });
    }
  });
  // 농구하는 날: 요일을 바꾸면 상자 머리줄(요일·이번 주 날짜)도 바로 바꾼다
  document.addEventListener('change', (e) => {
    const s = e.target;
    if (!s.matches || !s.matches('[data-day-row] select[data-k=weekday]')) return;
    const w = s.closest('[data-day-row]').querySelector('.day-when'); if (w) w.innerHTML = dayHd(s.value);
  });
  // 팀 색상 직접 고르기
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'thMain' && e.target.id !== 'thAccent') return;
    themePreview({ main: $('#thMain').value, accent: $('#thAccent').value });
  });
  // 분배 조건의 선수 고르기
  document.addEventListener('change', (e) => {
    const s = e.target;
    if (!s.matches || !s.matches('select.tgc') || !S.cache.tg) return;
    const mem = S.cache.tg[s.dataset.kind][+s.dataset.r];
    if (mem) mem[+s.dataset.m] = s.value;
  });
  // '표 보는 법'·'지표 설명' 열림 상태를 다시 그려도 유지
  document.addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.keep; if (k) psState().open[k] = e.target.open; }, true);

  document.addEventListener('click', (e) => {
    // 선수 기록 표: 칸을 누르면 그 줄(같은 선수)을 노랗게 표시, 다시 누르면 해제
    const td = e.target.closest('.ps-tbl tbody td,.ps-tbl tfoot td');
    if (td && !e.target.closest('[data-act],a')) {
      const k = td.parentNode.getAttribute('data-k');
      if (k) { const st = psState(); st.sel = st.sel === k ? '' : k; document.querySelectorAll('.ps-tbl tr[data-k]').forEach((r) => r.classList.toggle('ps-sel', !!st.sel && r.getAttribute('data-k') === st.sel)); }
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el || !A[el.dataset.act]) return;
    e.preventDefault();
    Promise.resolve(A[el.dataset.act](el, e)).catch(() => { /* run() 이 이미 알림 */ });
  });
  let qTimer;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'exQ') {
      clearTimeout(qTimer);
      qTimer = setTimeout(async () => { S.cache.ex.q = e.target.value; const pos = e.target.selectionStart; await render(); const q = $('#exQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250);
    }
  });
  function afterRender() {
    syncBarHeight();
    // 참석 탭: 공지가 5줄 안에 들어가면 '더보기' 없앰 · 펼친 한마디는 최근 말이 보이게 맨 아래로
    const nb = $('.att .nb[data-act] .nb-body');
    if (nb && nb.scrollHeight <= 120) { const c = nb.parentNode; c.classList.remove('clamp'); c.removeAttribute('data-act'); const f = c.querySelector('.fold-more'); if (f) f.remove(); }
    const kk = $('#kkCard.open.many .kk'); if (kk) { kk.scrollTop = kk.scrollHeight; kk.removeAttribute('data-act'); }
    // 참석 탭에서 날짜를 골라 '현황 보기'로 왔으면 그 날짜 칸으로
    if (S.cache.stFocus && S.route.tab === 'status') {
      const el = $('#st-' + S.cache.stFocus); S.cache.stFocus = null;
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - ($('.appbar') ? $('.appbar').offsetHeight : 0) - ($('.tabs') ? $('.tabs').offsetHeight : 0) - 10;
        window.scrollTo({ top, behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
      }
    }
    window.onbeforeunload = Ext.unsaved && Ext.unsaved() ? () => '기록 입력 중입니다' : null;
  }

  /* 안드로이드 뒤로 버튼 */
  try {
    const App = cap && cap.Plugins && cap.Plugins.App;
    if (App) App.addListener('backButton', () => { if (!back()) App.exitApp(); });
  } catch (e) { /* 웹 미리보기 */ }

  A.retryBoot = () => boot();
  async function boot() {
    try { S.user = await Api.me(); } catch (e) { // 인터넷이 끊겼을 때: 로딩 화면에 갇히지 않고 다시 시도 버튼
      hideSplash();
      $('#app').innerHTML = '<div class="login"><div class="logo">' + ballSvg(76) + '</div><h1>나의 농구팀</h1><div class="box"><p>' + esc(e.message) + '</p><button class="btn block mt12" data-act="retryBoot">다시 시도</button></div></div>';
      return;
    }
    S.stack = [];
    if (!S.user) { S.route = { page: 'login' }; render(); return; }
    const gt = takeGoTeam(); // 팀 링크로 들어왔으면 그 팀으로 (팀원이면 참석 탭, 아니면 팀 소개·가입 신청)
    if (gt) {
      try {
        await Api.getTeam(gt);
        S.mems = await Api.myMemberships();
        const m = S.mems.find((x) => x.teamId === gt && x.status === 'active');
        go({ page: 'team', teamId: gt, tab: m ? 'attend' : '' }, true);
        return;
      } catch (e) { toast('링크의 팀을 찾지 못했습니다. 팀이 지워졌거나 주소가 잘못됐습니다', 'error'); }
    }
    await home(true);
  }
  // 참석 탭 한마디 입력창: Enter = 전송
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'kkIn' && !e.isComposing) { e.preventDefault(); A.attChatSend().catch(() => { /* run() 이 이미 알림 */ }); }
  });
  // 로그인 화면: 비밀번호 칸에서 Enter = 로그인 (PC)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || S.route.page !== 'login' || !e.target.matches || !e.target.matches('#lgId,#lgPw,#lgPw2,#lgName,#lgNo,#lgBy')) return;
    e.preventDefault();
    if (S.loginMode === 'up') A.signupNick(); else if (e.target.id === 'lgId') $('#lgPw').focus(); else A.loginNick();
  });
  window.AppCtx = { S, $, esc, toast, vibrate, run, modal, closeModal, confirmBox, render, A, ROLE, fmtTime, initial, boot, TEAM_COLORS, COLOR_PRESET, POS_LBL, byPos,
    psState, psTr, psSub, psPct, psCells, psSumCells, psNameCell, psDetails, psSortVal, psEvalCard, playerStatsHtml, avTableHtml, PS_ARW };
})();
