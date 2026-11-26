/* =========================================================
 *  기록 입력(기록지) · 선수 기록 · 날짜별 보기 · 영상 링크 · 가로 보기
 *  코모도 참석자 웹페이지의 같은 화면을 그대로 옮긴 것.
 *  웹페이지의 '넓은 창'은 여기서 화면 전체를 덮는 창(#full), 그 위의 작은 팝업은 app.js 의 modal() 을 쓴다.
 *  웹과 다른 점: 기록자 = 로그인한 내 이름, 관리자 비밀번호 대신 팀 대표·임원 권한.
 * ========================================================= */
(function () {
  'use strict';
  const C = window.AppCtx, Ext = window.AppExt;
  const S = C.S, $ = C.$, esc = C.esc, toast = C.toast, modal = C.modal, closeModal = C.closeModal, A = C.A;
  const U = Api.util, KEYS = Stats.KEYS, VIEW = Stats.VIEW;
  const ATT = { p2m: 'p2a', p3m: 'p3a', ftm: 'fta' };    // 성공 → 짝이 되는 시도
  const MADE = { p2a: 'p2m', p3a: 'p3m', fta: 'ftm' };   // 시도 → 짝이 되는 성공
  const defColor = (i) => C.TEAM_COLORS[i % C.TEAM_COLORS.length];
  const blank = () => { const o = {}; KEYS.forEach((k) => { o[k] = 0; }); return o; };
  const pts = (s) => (s ? (s.p2m || 0) * 2 + (s.p3m || 0) * 3 + (s.ftm || 0) : 0);
  const pct = (m, a) => (a > 0 ? Math.round(m / a * 100) + '%' : '-');
  /* 배경색 밝기에 따라 글자색을 검정/흰색으로 */
  function fg(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length < 6) return '#ffffff';
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1a1a' : '#ffffff';
  }
  const chip = (label, color) => '<span class="rs-chip" style="background:' + esc(color || '#8d8d8d') + ';color:' + fg(color || '#8d8d8d') + '">' + esc(label) + '</span>';
  const today = () => U.ymd(new Date());
  const scoreOf = (g, team) => team.players.reduce((n, p) => n + pts(g.stats[p.key]), 0);
  const isWide = () => window.innerWidth >= 900;

  /* =========================================================
   *  화면 전체를 덮는 창
   * ========================================================= */
  const Full = { fn: null, view: '' };
  async function openFull(fn, keep) {
    Full.fn = fn;
    let el = $('#full');
    if (!el) { el = document.createElement('div'); el.id = 'full'; document.body.appendChild(el); document.body.classList.add('has-full'); }
    const sc0 = scroller(el);
    const st = keep && sc0 ? { top: sc0.scrollTop, left: [...el.querySelectorAll('.ps-wrap,.rs-tblwrap')].map((w) => [w.scrollLeft, w.scrollTop]) } : null;
    let html;
    try { html = await fn(); } catch (e) { html = '<div class="card">' + esc(e.message) + '</div><div class="acts"><button class="btn gray" data-act="fullClose">닫기</button></div>'; }
    if (Full.fn !== fn) return; // 그 사이 다른 화면으로 넘어갔다
    el.className = Full.view === 'rs-sheet' ? 'sheet' : '';
    el.innerHTML = '<div class="full-in">' + html + '</div>';
    const sc = scroller(el);
    if (st) { sc.scrollTop = st.top; el.querySelectorAll('.ps-wrap,.rs-tblwrap').forEach((w, i) => { const v = st.left[i]; if (v) { w.scrollLeft = v[0]; w.scrollTop = v[1]; } }); } else sc.scrollTop = 0; // 표 안 스크롤(머리줄 고정 표)도 유지
  }
  /* 세로로 내려 보는 상자: 보통은 창(#full) 자체, 가로 보기에서는 돌려 그린 안쪽 상자(.full-in) */
  const scroller = (el) => (rot ? el.querySelector('.full-in') : el);
  const refreshFull = () => (Full.fn ? openFull(Full.fn, true) : null); // 보던 위치(세로, 표마다 가로) 유지
  function closeFull() {
    Full.fn = null; Full.view = '';
    const el = $('#full'); if (el) el.remove();
    document.body.classList.remove('has-full');
    rotOff();
    C.render();
  }
  const head = (title, right, sub) => '<div class="rs-hd"><h3>' + title + '</h3>' + (sub ? '<span class="rs-sub">' + sub + '</span>' : '') + (right ? '<div class="rs-hd-r">' + right + '</div>' : '') + '</div>';
  A.fullClose = closeFull;
  /* 안드로이드 뒤로 버튼 */
  Ext.back = () => {
    if (!Full.fn) return false;
    if (Full.view.indexOf('rs-') === 0) closeAsk();
    else if (Full.view === 'ps-player' || Full.view === 'ps-date') openSummary();
    else closeFull();
    return true;
  };

  /* ===== 화면 회전 (가로 보기) =====
     앱은 세로로 든 채 쓰므로 창 안쪽 상자를 90도 돌려 그린다. 회전했으므로 '가로 = 화면 높이', '세로 = 화면 너비'
     돌리기 전 상자 폭(= 화면 높이)이 화면보다 넓어서, 바깥 창이 잘라 주지 않으면 앱(WebView)이 페이지를 그만큼 넓게 잡고
     전체를 축소해 화면 왼쪽 반에만 그려진다 → 바깥 창(#full)은 화면 크기 그대로 두고 넘친 부분을 자른다 (style.css) */
  let rot = false;
  // 폰을 실제로 가로로 들었는지 (키보드가 올라와 화면이 낮아진 것과 구분하려고 화면 방향 정보를 본다)
  function physLandscape() {
    try { if (screen.orientation && screen.orientation.type) return screen.orientation.type.indexOf('landscape') === 0; } catch (e) { /* 없음 */ }
    return Math.abs(window.orientation || 0) === 90;
  }
  function rotSize() {
    const vv = window.visualViewport;
    const ws = [vv && vv.width, document.documentElement.clientWidth, window.innerWidth, window.screen && screen.width].filter((x) => x > 0);
    const hs = [vv && vv.height, window.innerHeight].filter((x) => x > 0);
    const w = Math.round(Math.min(...ws)), h = Math.round(Math.min(...hs));
    if (!w || !h || w > h) return; // 실제로 가로로 든 상태(또는 키보드)면 재지 않는다
    document.body.style.setProperty('--rot-w', h + 'px');
    document.body.style.setProperty('--rot-h', w + 'px');
    document.body.classList.toggle('rot-sm', h <= 720); // 작은 폰: 표를 더 촘촘하게
  }
  function rotOff() {
    if (!rot) return;
    rot = false;
    document.body.classList.remove('rot', 'rot-sm');
    document.body.style.removeProperty('--rot-w'); document.body.style.removeProperty('--rot-h');
  }
  /* 좁은 세로 화면에서만 나오는 가로 보기 버튼 (기록지·선수 기록 공용) */
  const rotateBtn = () => (isWide() || (!rot && window.innerWidth > window.innerHeight) ? '' : '<button class="rs-tool" data-act="rsRotate">' + (rot ? '' + I.phone + ' 세로 보기' : '' + I.rotate + ' 가로 보기') + '</button>');
  A.rsRotate = () => {
    if (rot) rotOff();
    else { rotSize(); document.body.classList.add('rot'); rot = true; toast('가로 보기 (버튼을 다시 누르면 해제)', 'success'); setTimeout(rotSize, 150); }
    refreshFull();
  };
  let rsTimer = null;
  window.addEventListener('resize', () => {
    // 가로 보기 중에 폰을 실제로 가로로 돌렸으면 화면이 이미 가로이므로 CSS 회전을 푼다 (안 풀면 옆으로 누운 채 반쪽만 보임)
    if (rot && physLandscape()) { rotOff(); refreshFull(); return; }
    if (rot) rotSize();
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => { if (Full.view === 'rs-sheet' && isWide() !== R.wide) refreshFull(); }, 200); // 기록지는 넓은 화면 경계를 넘을 때만 다시 그린다
  });

  /* ===== 달력 (지난 경기 고르기 · 날짜별 보기 공용) ===== */
  const cal = { y: 0, m: 0, cell: null, title: '', hint: '' };
  function calShow() {
    const first = new Date(cal.y, cal.m, 1).getDay(), dim = new Date(cal.y, cal.m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="ps-cd empty"></div>';
    for (let d = 1; d <= dim; d++) cells += cal.cell(cal.y + '-' + String(cal.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), d);
    modal('<h3>' + cal.title + '</h3><div class="ps-calhd"><button data-act="calMove" data-v="-1">‹</button><span>' + cal.y + '년 ' + (cal.m + 1) + '월</span><button data-act="calMove" data-v="1">›</button></div>' +
      '<div class="ps-cwd">' + Api.WEEKDAYS.map((w) => '<div>' + w + '</div>').join('') + '</div><div class="ps-cal">' + cells + '</div>' +
      '<p class="ps-note mt8">' + cal.hint + '</p><div class="acts"><button class="btn gray" data-act="closeModal">닫기</button></div>');
  }
  A.calMove = (el) => { cal.m += +el.dataset.v; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } calShow(); };
  function calOpen(base, o) { const d = base ? new Date(base + 'T00:00:00') : new Date(); cal.y = d.getFullYear(); cal.m = d.getMonth(); Object.assign(cal, o); calShow(); }

  /* ===== 영상 링크 (유튜브 등). 서버는 [날짜, 게임 번호, 주소] 로 준다. 게임 번호 0 = 그 날 전체 영상 ===== */
  function ytId(u) {
    const t = String(u || '').trim();
    const m = t.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/))([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(t) ? t : '';
  }
  /* 유튜브면 표준 주소로 정리(시작 시간 t= 는 유지), 그 밖의 주소는 그대로 */
  function vidNorm(u) {
    const t = String(u || '').trim();
    if (!t) return '';
    const id = ytId(t);
    if (!id) return /^https?:\/\//i.test(t) ? t : '';
    const sec = t.match(/[?&#]t=(\d+)/);
    return 'https://www.youtube.com/watch?v=' + id + (sec ? '&t=' + sec[1] : '');
  }
  const vidKey = (d, g) => d + '|' + (Number(g) || 0);
  function vidMap(list) { const m = {}; (list || []).forEach((v) => { const u = vidNorm(v[2]); if (u) m[vidKey(v[0], v[1])] = u; }); return m; }
  const vidFind = (map, d, g) => (map ? map[vidKey(d, g)] || map[vidKey(d, 0)] || '' : ''); // 게임 전용 링크가 없으면 그 날 전체 영상
  const vidLink = (url, label, cls) => '<a class="' + (cls || 'ps-yt') + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + I.play + ' ' + esc(label) + '</a>';

  /* =========================================================
   *  기록 탭 (경기 목록)
   * ========================================================= */
  Ext.gamesHtml = async (t) => {
    const games = S.games = await Api.listGames(t.id);
    S.vid = vidMap(await Api.listVideos(t.id));
    const d = t.isMember ? readDraft() : null;
    return '<div class="row" style="margin-bottom:12px">' + (t.isMember ? '<button class="btn grow" data-act="rsOpen">' + I.note + ' 기록 입력</button>' : '') + '<button class="btn grow line" data-act="psOpen">' + I.trend + ' 선수 기록</button></div>' +
      (d && hasInput(d.stats) ? '<button class="prev" style="width:100%;text-align:left" data-act="rsOpen">' + I.alert + ' 저장하지 않은 기록이 있습니다: <b>' + esc(d.date + ' ' + d.game + '게임') + '</b> · 눌러서 이어서 입력</button>' : '') +
      '<div class="card"><h2>' + I.calendar + ' 경기 목록' + (games.length ? '<span class="muted" style="margin-left:auto;font-weight:500">날짜를 누르면 펼쳐집니다</span>' : '') + '</h2>' + (games.length ? gameDays(games) : '<p class="empty">아직 기록된 경기가 없습니다.</p>') + '</div>';
  };
  /* 경기 목록을 날짜별 토글로 (가장 최근 날짜만 처음에 펼침, 펼친 상태는 다시 그려도 유지) */
  function gameDays(games) {
    const byDate = [];
    games.forEach((g) => { const last = byDate[byDate.length - 1]; if (last && last.date === g.date) last.list.push(g); else byDate.push({ date: g.date, list: [g] }); });
    const open = C.psState().open;
    return byDate.map((d, i) => {
      const k = 'gd:' + d.date, on = open[k] != null ? open[k] : i === 0;
      const dt = new Date(d.date + 'T00:00:00'), wd = Api.WEEKDAYS[dt.getDay()];
      const hasVid = d.list.some((g) => vidFind(S.vid, g.date, g.gameNo));
      const rows = d.list.slice().sort((a, b) => a.gameNo - b.gameNo).map((g) => {
        const sc = g.teams.map((x) => chip(x.name, x.color) + ' <b>' + scoreOf(g, x) + '</b>').join(' : ') + (g.teams.length < 2 ? ' <span class="muted">· 상대 팀 대기</span>' : '');
        return '<button class="game" data-act="gOpen" data-id="' + g.id + '"><div><div style="font-weight:700">' + g.gameNo + '게임' + (vidFind(S.vid, g.date, g.gameNo) ? ' <span class="ps-yt">' + I.play + '</span>' : '') + '</div>' +
          '<div class="muted">' + (g.recorder ? '' + I.pencil + ' ' + esc(g.recorder) : '') + '</div></div><span class="sc">' + sc + '</span></button>';
      }).join('');
      return '<details class="gday" data-keep="' + esc(k) + '"' + (on ? ' open' : '') + '><summary><span class="gd-date">' + esc(d.date) + ' (' + wd + ')</span><span class="gd-n">' + d.list.length + '게임</span>' +
        (hasVid ? '<span class="ps-yt">' + I.play + '</span>' : '') + (d.date === today() ? '<span class="chip">오늘</span>' : '') + '</summary><div class="gd-list">' + rows + '</div></details>';
    }).join('');
  }
  /* 저장된 한 게임 보기 */
  function gameTable(g, team) {
    const rows = team.players.map((p) => ({ key: p.key, name: p.name, guest: p.guest, totals: Stats.vec(g.stats[p.key]), pts: pts(g.stats[p.key]) }));
    const maxes = Stats.teamMaxes(rows), tot = new Array(KEYS.length).fill(0);
    let sum = 0;
    const body = rows.map((x) => { x.totals.forEach((v, i) => { tot[i] += v; }); sum += x.pts; return C.psTr('n:' + x.key) + '<td class="ps-name">' + esc(x.name) + (x.guest ? '<span class="rs-g">게</span>' : '') + '</td>' + C.psCells(x.totals, x.pts, 1, maxes) + '</tr>'; }).join('');
    return '<div class="ps-gtitle" style="background:' + esc(team.color) + ';color:' + fg(team.color) + '"><span>' + esc(team.name) + '팀 · ' + sum + '점</span>' + (team.recorder ? '<span class="who">' + I.pencil + ' ' + esc(team.recorder) + '</span>' : '') + '</div>' +
      '<div class="ps-wrap"><table class="ps-tbl"><thead>' + viewHead('<th class="ps-name">선수</th>') + '</thead><tbody>' + body + '</tbody><tfoot><tr><td class="ps-name">합계</td>' + C.psCells(tot, sum, 1) + '</tr></tfoot></table></div>';
  }
  const viewHead = (first) => '<tr>' + first + VIEW.map((c) => '<th>' + c.code + C.psSub(c.ko) + '</th>').join('') + '</tr>';
  A.gOpen = (el) => {
    const g = S.games.find((x) => x.id === el.dataset.id), t = S.team;
    if (!g) return;
    const v = vidFind(S.vid, g.date, g.gameNo);
    modal('<h3>' + esc(g.date) + ' · ' + g.gameNo + '게임' + (v ? ' ' + vidLink(v, '영상') : '') + '</h3>' + g.teams.map((team) => gameTable(g, team)).join('') +
      '<div class="acts">' + (t.isMember && ((t.perms || []).includes('records') || g.date === today()) ? '<button class="btn line" data-act="geEdit" data-id="' + g.id + '">고치기</button>' : '') +
      ((t.perms || []).includes('records') ? '<button class="btn danger" data-act="gDel" data-id="' + g.id + '">삭제</button>' : '') + '<button class="btn gray" data-act="closeModal">닫기</button></div>');
  };
  A.gDel = async (el) => {
    if (!(await C.confirmBox('경기 기록 삭제', '이 경기 기록을 지울까요? 되돌릴 수 없습니다.', '삭제', true))) return;
    await C.run(Api.deleteGame(S.team.id, el.dataset.id), '삭제했습니다'); C.render();
  };
  /* 저장된 게임을 기록지로 불러와 고친다 */
  A.geEdit = (el) => {
    const g = S.games.find((x) => x.id === el.dataset.id);
    if (!g) return;
    closeModal();
    resetR();
    const day = S.team.days.find((d) => d.date === g.date);
    Object.assign(R, { date: g.date, day: g.day || (day ? day.title : ''), dayId: day ? day.id : '', game: g.gameNo, past: g.date !== today(), gameTouched: true,
      teams: g.teams.map((x) => ({ label: x.name, color: x.color, members: x.players.map((p) => ({ key: p.key, name: p.name, position: p.position || '', guest: !!p.guest })) })),
      stats: JSON.parse(JSON.stringify(g.stats)), inMode: g.teams.length < 2 ? 'team' : 'solo', match: g.teams.length < 2 ? [0] : [0, 1] });
    saveDraft(); renderSheet();
  };

  /* =========================================================
   *  기록지 입력
   * ========================================================= */
  // 입력 방식 inMode: 'solo' = 한 사람이 두 팀 모두 / 'team' = 한 사람이 한 팀씩 따로 저장
  const R = {};
  function resetR() {
    Object.assign(R, { team: S.team ? S.team.id : '', date: '', dayId: '', day: '', teams: [], game: 1, match: [0, 1], tab: 0, mode: 1, stats: {}, hist: [],
      past: false, loadedFrom: '', inMode: 'solo', startMode: 'solo', gameTouched: false, dayGames: [], wide: false, busy: false });
  }
  const recorder = () => S.team.my.profile.name;
  const sGet = (key) => R.stats[key] || (R.stats[key] = blank());
  const teamAt = (i) => R.teams[i] || null;
  const hasInput = (stats) => Object.keys(stats || {}).some((n) => KEYS.some((k) => (stats[n][k] || 0) > 0));
  /* 당일 제한: 팀원은 경기 당일 기록만 입력·수정. 지난 날짜는 대표·임원만 (서버도 같은 기준으로 한 번 더 막는다) */
  const canEdit = (date) => (S.team.perms || []).includes('records') || date === today();
  /* 오늘 날짜에 해당하는 모임 요일. 없으면 'O요일' */
  function todayDay() {
    const d = S.team.days.find((x) => x.date === today());
    return d ? { id: d.id, title: d.title } : { id: '', title: Api.WEEKDAYS[new Date().getDay()] + '요일' };
  }
  function fixMatch() {
    const n = R.teams.length;
    if (R.inMode === 'team') { R.match = [(R.match[0] >= 0 && R.match[0] < n) ? R.match[0] : 0]; return; }
    if (R.match.length < 2 || R.match[0] >= n || R.match[1] >= n || R.match[0] === R.match[1]) R.match = [0, Math.min(1, Math.max(0, n - 1))];
  }

  /* ===== 임시 저장 (앱이 꺼져도 이어서 입력) ===== */
  const DRAFT_KEY = 'myhoop.rs.v1';
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ user: S.user.id, team: R.team, date: R.date, dayId: R.dayId, day: R.day, teams: R.teams, game: R.game, match: R.match,
        stats: R.stats, mode: R.inMode, view: Full.view === 'rs-sheet' ? 'sheet' : 'setup', t: Date.now() }));
    } catch (e) { /* 저장소 막힘 */ }
  }
  function readDraft() {
    try {
      const o = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      return (o && S.user && o.user === S.user.id && S.team && o.team === S.team.id && o.teams && o.teams.length) ? o : null;
    } catch (e) { return null; }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ } }
  Ext.clearDraft = clearDraft;
  /* 저장하지 않은 기록이 기기에 남아 있는지 (저장하면 임시 저장이 지워진다) */
  const unsaved = () => { const d = readDraft(); return !!(d && hasInput(d.stats)); };
  Ext.unsaved = () => !!Full.fn && Full.view.indexOf('rs-') === 0 && unsaved();
  function applyDraft(d) {
    resetR();
    Object.assign(R, { date: d.date, dayId: d.dayId || '', day: d.day || '', teams: d.teams || [], game: d.game || 1, inMode: d.mode === 'team' ? 'team' : 'solo',
      match: d.match || [0, 1], stats: d.stats || {}, past: d.date !== today() });
    fixMatch();
  }
  /* 이어서 입력 / 나가기 확인 창에 보여줄 요약 */
  function resumeInfo(d) {
    const teams = d.teams || [], match = d.match || [];
    const lbl = (i) => (teams[i] ? esc(teams[i].label) + '팀' : '-');
    return '<div class="rs-resume">' + I.pencil + ' 기록자 <b>' + esc(recorder()) + '</b><br>' + I.calendar + ' ' + esc((d.date || '-') + ' ' + (d.day || '')) + ' · <b>' + (d.game || 1) + '게임</b><br>' + I.users + ' ' +
      (d.mode === 'team' ? '팀별 입력 · <b>' + lbl(match[0]) + '</b> 기록' : '혼자 입력 · ' + lbl(match[0]) + ' vs ' + lbl(match[1])) + '</div>';
  }
  function leaveAsk() {
    modal('<h3>기록 입력 중입니다</h3><p class="muted">저장하지 않은 기록이 있습니다.<br>나가도 기기에 임시 저장되어, 다시 들어오면 이어서 입력할 수 있습니다.</p>' +
      resumeInfo({ mode: R.inMode, date: R.date, day: R.day, game: R.game, match: R.match, teams: R.teams }) +
      '<div class="acts"><button class="btn gray" data-act="rsLeave">나가기</button><button class="btn" data-act="closeModal">계속 입력</button></div>');
  }
  /* '닫기': 저장 안 한 기록이 있으면 한 번 확인 */
  function closeAsk() { if (unsaved()) leaveAsk(); else closeFull(); }
  A.rsClose = closeAsk;
  A.rsLeave = () => { closeModal(); closeFull(); };

  /* ===== 진입 ===== */
  A.rsOpen = () => {
    if (R.team !== S.team.id) resetR();
    const d = readDraft();
    if (d && hasInput(d.stats)) { renderStart(); askResume(d); return; }       // 저장 안 한 기록 → 이어서?
    if (R.teams.length && canEdit(R.date)) { renderSetup(); return; }           // 이번에 쓰던 설정 그대로
    if (d && d.date === today()) { applyDraft(d); renderSetup(); return; }      // 기록 없는 오늘 임시 저장 → 팀·날짜만 이어받는다
    renderStart();
  };
  function askResume(d) {
    modal('<h3>이어서 입력할까요?</h3><p class="muted">저장하지 않은 기록이 남아 있습니다.</p>' + resumeInfo(d) +
      (canEdit(d.date) ? '' : '<div class="rs-warn mt8">지난 날짜 기록이라 저장은 <b>대표·임원</b>만 할 수 있습니다.</div>') +
      '<div class="acts"><button class="btn gray" data-act="rsDropAsk">새로 시작</button><button class="btn" data-act="rsResume">이어서 입력</button></div>').dataset.lock = '1';
  }
  A.rsResume = () => {
    const d = readDraft();
    closeModal();
    if (!d) return;
    applyDraft(d);
    if (d.view === 'sheet') { R.tab = 0; renderSheet(); } else renderSetup(); // 기록 화면에서 나갔던 거라면 곧바로 기록 화면으로
  };
  /* 새로 시작하면 남은 기록이 지워지므로 한 번 더 확인한다 */
  A.rsDropAsk = () => {
    const d = readDraft();
    modal('<h3>새로 시작할까요?</h3><p class="muted">저장하지 않은 아래 기록이 지워집니다.</p>' + (d ? resumeInfo(d) : '') +
      '<div class="acts"><button class="btn gray" data-act="rsDropBack">돌아가기</button><button class="btn danger" data-act="rsDrop">지우고 새로 시작</button></div>').dataset.lock = '1';
  };
  A.rsDropBack = () => { const d = readDraft(); if (d) askResume(d); else closeModal(); };
  A.rsDrop = () => { clearDraft(); resetR(); closeModal(); renderStart(); };

  /* ===== 시작 화면 (기록자 → 입력 방식) ===== */
  function renderStart() {
    R.startMode = R.inMode;
    openFull(() => {
      Full.view = 'rs-start';
      const btn = (k, title, desc) => '<button class="rs-modebtn' + (R.startMode === k ? ' on' : '') + '" data-act="rsMode" data-v="' + k + '"><b>' + title + '</b><span>' + desc + '</span></button>';
      return head('' + I.note + ' 기록 입력') + '<div class="card"><label class="f">기록자 (입력하는 팀원)</label><div class="rs-whobox">' + I.pencil + ' <b>' + esc(recorder()) + '</b> <span class="muted">로그인한 내 이름으로 기록됩니다</span></div>' +
        '<label class="f">입력 방식</label><div class="rs-modepick">' +
        btn('solo', '' + I.user + ' 혼자 입력', '한 사람이 두 팀 기록을 모두 입력하고 한 번에 저장합니다.') +
        btn('team', '' + I.users + ' 팀별 입력 (실시간)', '한 사람이 한 팀씩 맡아 각자 폰에서 입력·저장합니다. 상대 팀 기록은 건드리지 않습니다.') + '</div>' +
        '<div class="acts"><button class="btn gray" data-act="rsClose">닫기</button><button class="btn" data-act="rsStartNext">다음 →</button></div></div>';
    });
  }
  A.rsMode = (el) => { R.startMode = el.dataset.v; refreshFull(); };
  A.rsToStart = renderStart;
  A.rsStartNext = () => {
    const changed = R.startMode !== R.inMode;
    R.inMode = R.startMode;
    if (changed) { R.match = [0, 1]; R.tab = 0; R.gameTouched = false; }
    fixMatch();
    // 처음 들어왔거나 수정할 수 없는 날짜에 머물러 있으면 오늘로 맞춘다
    if (!R.teams.length || !canEdit(R.date)) {
      const d = todayDay();
      Object.assign(R, { past: false, dayId: d.id, day: d.title, date: today(), teams: [], stats: {}, hist: [], gameTouched: false });
      loadTeams();
      return;
    }
    saveDraft(); renderSetup();
  };

  /* ===== 그 날 게임 진행 현황 =====
     '몇 게임까지 저장됐는지'를 보여 주고, 다음에 입력할 게임 번호를 잡아 준다.
     게임 번호를 직접 바꾼 뒤(gameTouched)에는 자동으로 바꾸지 않는다. */
  const statusGames = () => R.dayGames.map((g) => ({ game: g.gameNo, teams: g.teams.map((x) => ({ label: x.name, color: x.color, pts: scoreOf(g, x), recorder: x.recorder || g.recorder || '', at: x.at || g.at || 0 })) }));
  /* 다음에 입력할 게임 번호. 팀별 입력: 상대 팀만 저장되고 내 팀은 아직인 게임이 있으면 그 게임, 아니면 마지막 게임 + 1 */
  function nextGameNo() {
    const gs = statusGames();
    if (!gs.length) return 1;
    if (R.inMode === 'team') {
      const my = teamAt(R.match[0]);
      const wait = my && gs.find((g) => g.teams.length === 1 && g.teams[0].label !== my.label);
      if (wait) return wait.game;
    }
    return gs[gs.length - 1].game + 1;
  }
  function autoGame() { if (R.gameTouched || hasInput(R.stats)) return; const n = nextGameNo(); if (n !== R.game) { R.game = n; saveDraft(); } }
  function progHtml() {
    const gs = statusGames();
    if (!gs.length) return '<div class="pg-hd">' + I.clipboard + ' 진행 현황<span class="pg-next">다음 입력 1게임</span></div><div class="pg-empty">' + esc(R.date) + ' 에 저장된 게임이 아직 없습니다.</div>';
    const my = R.inMode === 'team' ? teamAt(R.match[0]) : null;
    const rows = gs.map((g) => {
      const score = g.teams.length >= 2 ? g.teams.map((x) => chip(x.label, x.color) + ' <span class="sc">' + x.pts + '</span>').join(' : ')
        : chip(g.teams[0].label, g.teams[0].color) + ' <span class="sc">' + g.teams[0].pts + '</span> <span class="wait">· 상대 팀 대기</span>';
      const who = g.teams.map((x) => x.recorder).filter((v, i, a) => v && a.indexOf(v) === i).join('·');
      const at = Math.max.apply(null, g.teams.map((x) => x.at || 0));
      const mine = my && g.teams.some((x) => x.label === my.label), cur = g.game === R.game;
      return '<button class="rs-pg' + (cur ? ' cur' : '') + '" data-act="rsPickGame" data-v="' + g.game + '"><span class="g">' + g.game + '게임</span>' + score +
        (cur ? ' <span class="now">← 입력 중' + (R.inMode === 'team' && !mine ? '' : ' (다시 저장하면 덮어씀)') + '</span>' : '') +
        '<span class="who">' + (who ? '' + I.pencil + ' ' + esc(who) + ' ' : '') + (at ? C.fmtTime(at) : '') + '</span></button>';
    }).join('');
    return '<div class="pg-hd">' + I.clipboard + ' 진행 현황 <b>' + gs[gs.length - 1].game + '게임까지 저장됨</b><span class="pg-next">다음 입력 ' + nextGameNo() + '게임</span></div>' + rows;
  }
  /* 현황에서 게임을 누르면 그 게임 번호로 (이미 저장된 게임을 고치거나, 상대 팀 대기 게임을 이어 입력) */
  A.rsPickGame = (el) => { R.game = +el.dataset.v; R.gameTouched = true; saveDraft(); refreshFull(); };

  /* ===== 설정 화면 (진행일·날짜 선택 → 팀 불러오기 → 대결 선택) ===== */
  const posTag = (p) => '<span class="pos">' + (C.POS_LBL[p] || '-') + '</span>';
  const guestTag = (m) => (m.guest ? '<span class="rs-g" title="게스트">게</span>' : '');
  /* 팀 카드 (명단 추가·빼기) */
  function teamCard(t, i) {
    return '<div class="rs-card"><h5><span class="rs-chip" style="background:#eee;color:#444">' + esc(t.label) + '팀</span><span class="cnt">' + t.members.length + '명</span>' +
      '<button class="rs-mini" data-act="rsAddPlayer" data-t="' + i + '">＋ 선수·게스트</button>' + (R.teams.length > 2 ? '<button class="rs-mini del" data-act="rsRemoveTeam" data-t="' + i + '">팀 제거</button>' : '') + '</h5>' +
      '<div class="rs-plist">' + (t.members.map((m, mi) => '<span class="rs-pchip' + (m.guest ? ' guest' : '') + '">' + posTag(m.position) + esc(m.name) + guestTag(m) + '<button data-act="rsSetupDel" data-t="' + i + '" data-m="' + mi + '" aria-label="빼기">✕</button></span>').join('') ||
        '<span class="rs-empty">＋ 선수·게스트 를 눌러 명단을 입력하세요</span>') + '</div></div>';
  }
  /* 유니폼색 고르기 */
  function swatches(ti) {
    const t = teamAt(ti);
    if (!t) return '';
    const c = String(t.color || '#8d8d8d').toLowerCase();
    return '<div class="rs-sw">' + C.COLOR_PRESET.map((p) => '<button class="rs-swb' + (c === p[1] ? ' on' : '') + '" title="' + p[0] + '" style="background:' + p[1] + '" data-act="rsColor" data-t="' + ti + '" data-c="' + p[1] + '"></button>').join('') +
      '<input type="color" class="rs-colorin" data-t="' + ti + '" value="' + esc(/^#[0-9a-f]{6}$/.test(c) ? c : '#8d8d8d') + '"></div>';
  }
  const gameField = () => '<label class="f">게임 번호</label><div class="rs-inline"><input class="in" type="number" id="rsGameInput" min="1" max="99" value="' + R.game + '" style="width:90px"><span class="muted">' +
    (R.inMode === 'team' ? '상대 팀 기록자와 <b>같은 게임 번호</b>로 맞춰 주세요. 같은 날짜·게임·팀으로 다시 저장하면 그 팀 기록만 덮어씁니다' : '같은 날짜·같은 게임 번호로 저장하면 기존 기록을 덮어씁니다') + '</span></div>';
  function renderSetup() {
    openFull(async () => {
      Full.view = 'rs-setup';
      const t = S.team, td = today();
      if (Api.refresh) Api.refresh(3000); // 다른 기록자가 방금 저장한 게임도 진행 현황에 보이게
      R.dayGames = (await Api.listGames(t.id)).filter((g) => g.date === R.date).sort((a, b) => a.gameNo - b.gameNo);
      autoGame();
      const dayBtns = t.days.map((d) => '<button data-act="rsPickDay" data-id="' + d.id + '" class="' + (!R.past && R.dayId === d.id ? 'on' : '') + '">' + esc(d.title) + (d.date === td ? ' (오늘)' : '') + '</button>').join('') || '<span class="muted">농구하는 날이 설정되지 않았습니다</span>';
      const pastBtn = '<button data-act="rsPastGate" class="' + (R.past ? 'on' : '') + '">' + I.calendar + ' 지난 경기' + ((t.perms || []).includes('records') ? ' 입력' : ' (대표·임원)') + '</button>';
      const lock = canEdit(R.date) ? '' : '<div class="rs-warn">팀원은 <b>경기 당일(' + esc(td) + ')</b> 기록만 입력·수정할 수 있습니다.<br>지난 기록은 대표·임원에게 부탁하세요.</div>';
      const who = '<span class="rs-who">' + I.pencil + ' ' + esc(recorder()) + ' · ' + (R.inMode === 'team' ? '팀별' : '혼자') + '<button data-act="rsToStart">변경</button></span>';
      const emptyPast = R.past && R.teams.length && !R.teams.some((x) => x.members.length) ? '<div class="rs-warn">이 날짜로 저장된 팀이 없습니다. 아래에서 팀을 직접 입력해 주세요.</div>' : '';
      const from = R.loadedFrom ? '<div class="rs-warn">' + esc(R.date) + ' 로 저장된 팀이 없어 <b>' + esc(R.loadedFrom) + '</b> 배정을 대신 불러왔습니다.<br>기록은 <b>' + esc(R.date) + '</b> 로 저장됩니다.</div>' : '';
      const startBtns = '<div class="acts"><button class="btn gray" data-act="rsAddTeam">+ 팀 추가</button><button class="btn" data-act="rsStart"' + (canEdit(R.date) ? '' : ' disabled') + '>' + I.play + ' 기록 시작</button></div>';
      let body;
      if (R.teams.length && R.inMode === 'team') {
        // 팀별 입력: 게임 번호 → 기록할 팀 → 유니폼색 → 그 팀 명단만 수정
        const my = R.match[0];
        body = gameField() + '<label class="f">내가 기록할 팀</label><div class="seg">' + R.teams.map((x, i) => '<button data-act="rsSetMyTeam" data-t="' + i + '" class="' + (i === my ? 'on' : '') + '">' + esc(x.label) + '팀 (' + x.members.length + '명)</button>').join('') + '</div>' +
          '<label class="f">유니폼색</label>' + swatches(my) + '<label class="f">선수 명단 (수정·추가)</label>' + (teamAt(my) ? teamCard(teamAt(my), my) : '') +
          '<p class="ps-note">상대 팀은 다른 기록자가 자기 폰에서 <b>팀별 입력</b>으로 같은 게임 번호를 골라 따로 입력합니다.</p>' + startBtns;
      } else if (R.teams.length) {
        const pairs = [];
        for (let i = 0; i < R.teams.length; i++) for (let j = i + 1; j < R.teams.length; j++) pairs.push([i, j]);
        body = R.teams.map(teamCard).join('') + '<label class="f">대결 팀</label><div class="seg">' +
          (pairs.map((p) => '<button data-act="rsSetMatch" data-a="' + p[0] + '" data-b="' + p[1] + '" class="' + (R.match[0] === p[0] && R.match[1] === p[1] ? 'on' : '') + '">' + esc(R.teams[p[0]].label) + ' vs ' + esc(R.teams[p[1]].label) + '</button>').join('') || '<span class="muted">팀이 2개 이상이어야 합니다</span>') + '</div>' +
          gameField() + '<p class="ps-note mt8">유니폼색은 기록지를 시작한 뒤 <b>' + I.shirt + ' 유니폼색</b> 버튼에서 게임마다 바꿀 수 있습니다.</p>' + startBtns;
      } else {
        body = '<div class="rs-warn">불러온 팀이 없습니다.<br>' + I.ball + ' <b>팀 편성</b>에서 팀을 배정한 뒤 <b>' + I.save + ' 팀 저장</b>을 누르면 여기서 바로 불러올 수 있습니다.</div>' +
          '<div class="acts"><button class="btn gray" data-act="rsBlank">빈 팀으로 시작</button><button class="btn" data-act="rsToLineup">팀 편성 열기</button></div>';
      }
      return head('' + I.note + ' 기록 입력', who) + '<div class="rs-dateline"><span class="dl-lbl">작성되는 날짜</span><span class="dl-date">' + esc(R.date || '-') + '</span>' + (R.day ? '<span class="dl-day">' + esc(R.day) + '</span>' : '') + '</div>' +
        '<div class="rs-prog">' + progHtml() + '</div><div class="card"><label class="f" style="margin-top:0">진행일 (누르면 저장된 팀을 불러옵니다)</label><div class="seg">' + dayBtns + pastBtn + '</div>' +
        lock + from + emptyPast + body + '</div><div class="rs-foot"><button class="rs-tool" data-act="rsClose">닫기</button></div>';
    });
  }
  A.rsSetMyTeam = (el) => { R.match = [+el.dataset.t]; R.tab = 0; R.gameTouched = false; saveDraft(); refreshFull(); }; // 맡은 팀이 바뀌면 다음 게임 번호도 다시 잡는다
  A.rsSetMatch = (el) => { R.match = [+el.dataset.a, +el.dataset.b]; R.tab = 0; saveDraft(); refreshFull(); };
  A.rsToLineup = () => { S.route.tab = 'lineup'; closeFull(); };
  /* 이번 주 해당 요일로 팀을 불러온다 */
  A.rsPickDay = (el) => {
    const d = S.team.days.find((x) => x.id === el.dataset.id);
    if (!d) return;
    Object.assign(R, { past: false, gameTouched: false, dayId: d.id, day: d.title, date: d.date });
    loadTeams();
  };
  /* 지난 경기는 대표·임원만 입력·수정한다. 달력으로 날짜를 고른 뒤 그 날의 팀을 불러온다.
     저장된 팀이 없는 날짜도 고를 수 있고, 그 경우 빈 팀이 만들어져 바로 배정할 수 있다. */
  A.rsPastGate = async () => {
    const t = S.team;
    if (!(t.perms || []).includes('records')) { toast('지난 경기 기록은 대표나 권한을 받은 임원만 입력·수정할 수 있습니다', 'error'); return; }
    const marks = {};
    (await Api.lineupDates(t.id)).forEach((x) => { marks[x[0]] = x[1] || ''; });
    Stats.dates(await Api.listGames(t.id)).forEach((d) => { if (!(d in marks)) marks[d] = ''; });
    R.marks = marks;
    const td = today();
    calOpen(R.date, { title: '' + I.calendar + ' 지난 경기 입력', hint: '초록색은 팀·기록이 저장된 날짜입니다.<br>다른 날짜를 골라도 바로 팀 배정을 할 수 있습니다.',
      cell: (ds, d) => '<div class="ps-cd' + ((ds in marks) ? ' has' : '') + (ds > td ? ' off' : '') + (ds === R.date ? ' sel' : '') + '"' + (ds > td ? '' : ' data-act="rsPickPast" data-d="' + ds + '"') + '>' + d + '</div>' });
  };
  A.rsPickPast = async (el) => {
    const date = el.dataset.d;
    closeModal();
    if (hasInput(R.stats) && !(await C.confirmBox('입력 중인 기록이 있습니다', '다른 날짜로 시작하면 지금 입력한 기록은 사라집니다. 계속할까요?', '새 날짜로 시작', true))) return;
    const d = new Date(date + 'T00:00:00');
    // 저장 기록이 없으면 고른 날짜의 실제 요일을 진행일로 쓴다 (모임 요일과 같으면 그 요일)
    const m = S.team.days.find((x) => x.weekday === d.getDay());
    Object.assign(R, { stats: {}, hist: [], past: true, gameTouched: false, date, dayId: m ? m.id : '', day: (R.marks || {})[date] || (d.getMonth() + 1) + '/' + d.getDate() + '(' + Api.WEEKDAYS[d.getDay()] + ')' });
    loadTeams();
  };
  async function loadTeams() {
    R.loadedFrom = '';
    const want = R.date;
    try {
      // 요청한 날짜가 없으면 그 요일의 '가장 최근 저장분'을 대신 받는다. 지난 경기는 콕 집은 날짜이므로 그 날짜의 저장분만 인정한다.
      const r = await Api.getLineup(S.team.id, { dayId: R.past ? '' : R.dayId, date: R.date });
      const loaded = (r && r.teams && r.teams.length && (!R.past || r.date === want)) ? r.teams : null;
      if (loaded) {
        if (R.past) { if (r.day) R.day = r.day; }
        else if (r.date !== want) R.loadedFrom = r.date; // 기록은 반드시 이번 주 날짜로 저장되어야 하므로 날짜는 바꾸지 않는다
        R.teams = loaded.map((x, i) => ({ label: x.label || '', color: x.color || defColor(i), members: (x.members || []).map((m) => ({ key: m.key, name: m.name, position: m.position || '', guest: !!m.guest })) }));
        R.teams.forEach((x) => x.members.forEach((m) => sGet(m.key)));
        fixMatch(); saveDraft();
      } else if (R.past) {
        // 지난 경기는 '불러오기'가 아니라 '입력'이다. 저장분이 없으면 빈 팀만 준비한다
        R.teams = [{ label: 'A', color: defColor(0), members: [] }, { label: 'B', color: defColor(1), members: [] }];
        R.match = [0, 1]; fixMatch();
      } else if (R.teams.some((x) => x.members.length)) {
        toast(R.date + ' 로 저장된 팀이 없어 현재 팀을 그대로 씁니다', 'error'); // 직접 구성해 둔 팀은 지우지 않는다
      } else R.teams = [];
    } catch (e) { toast(e.message || '불러오기 실패', 'error'); }
    renderSetup();
  }
  A.rsBlank = () => { R.teams = [{ label: 'A', color: defColor(0), members: [] }, { label: 'B', color: defColor(1), members: [] }]; R.match = [0, 1]; fixMatch(); saveDraft(); refreshFull(); };
  A.rsAddTeam = () => { R.teams.push({ label: String.fromCharCode(65 + R.teams.length), color: defColor(R.teams.length), members: [] }); saveDraft(); refreshFull(); };
  /* 잘못 추가한 팀 되돌리기. 팀은 최소 2개는 남긴다 */
  A.rsRemoveTeam = async (el) => {
    const i = +el.dataset.t, t = teamAt(i);
    if (!t) return;
    if (R.teams.length <= 2) { toast('팀은 2개 이상이어야 합니다', 'error'); return; }
    if (t.members.length && !(await C.confirmBox(t.label + '팀 제거', t.members.length + '명이 들어 있습니다. 제거하면 이 팀의 명단과 기록이 사라집니다.', '제거', true))) return;
    R.teams.splice(i, 1)[0].members.forEach(dropStats);
    R.teams.forEach((x, k) => { if (/^[A-Z]$/.test(x.label)) x.label = String.fromCharCode(65 + k); }); // YB/OB 처럼 직접 지은 이름은 건드리지 않는다
    R.match = [0, Math.min(1, R.teams.length - 1)]; fixMatch();
    saveDraft(); refreshFull(); toast('팀을 제거했습니다', 'success');
  };
  function dropStats(m) { delete R.stats[m.key]; R.hist = R.hist.filter((h) => h.key !== m.key); }
  A.rsSetupDel = (el) => { const t = teamAt(+el.dataset.t), m = t && t.members[+el.dataset.m]; if (!m) return; t.members.splice(+el.dataset.m, 1); dropStats(m); saveDraft(); refreshFull(); };
  function setColor(i, c) { if (!R.teams[i]) return; R.teams[i].color = c; saveDraft(); refreshFull(); if ($('#modalBg')) colorDialog(); }
  A.rsColor = (el) => setColor(+el.dataset.t, el.dataset.c);
  /* 유니폼색 (기록지 시작 후, 게임마다 변경) */
  function colorDialog() {
    modal('<h3>' + I.shirt + ' 유니폼색</h3><p class="muted">기록지 상단 색이 바뀝니다. 게임마다 유니폼이 달라지면 여기서 변경하세요.</p>' +
      R.match.map((ti) => (teamAt(ti) ? '<div class="rs-card"><h5>' + chip(teamAt(ti).label + '팀', teamAt(ti).color) + '</h5>' + swatches(ti) + '</div>' : '')).join('') +
      '<div class="acts"><button class="btn" data-act="closeModal">확인</button></div>');
  }
  A.rsColorDlg = colorDialog;
  A.rsStart = () => {
    if (!R.date) { toast('날짜를 선택해 주세요', 'error'); return; }
    if (!canEdit(R.date)) { toast('당일 경기만 입력할 수 있습니다 (지난 경기는 대표·임원)', 'error'); return; }
    if (R.inMode === 'team') {
      const t = teamAt(R.match[0]);
      if (!t) { toast('기록할 팀을 선택해 주세요', 'error'); return; }
      if (!t.members.length) { toast(t.label + '팀 선수를 먼저 추가해 주세요', 'error'); return; }
    } else {
      if (R.teams.length < 2) { toast('팀이 2개 이상 필요합니다', 'error'); return; }
      if (R.match[0] === R.match[1]) { toast('서로 다른 두 팀을 선택해 주세요', 'error'); return; }
    }
    R.tab = 0; R.mode = 1;
    renderSheet();
  };
  A.rsSetup = renderSetup;

  /* ===== 기록지 본화면 ===== */
  function totals(ti) {
    const t = teamAt(ti), o = blank();
    o.pts = 0;
    if (t) t.members.forEach((m) => { const s = sGet(m.key); KEYS.forEach((k) => { o[k] += (s[k] || 0); }); o.pts += pts(s); });
    return o;
  }
  /* 점수판과 '팀 기록지 선택'을 하나로 합친 막대. 좁은 화면에서는 누르면 그 팀 기록지로 바뀐다 */
  function scoreHtml() {
    const pick = !R.wide && R.match.length > 1;
    return R.match.map((ti, idx) => {
      const t = teamAt(ti);
      if (!t) return '';
      const st = 'background:' + esc(t.color || '#8d8d8d') + ';color:' + fg(t.color || '#8d8d8d');
      const inner = '<span class="sc-t">' + esc(t.label) + '팀</span><span class="sc-n">' + totals(ti).pts + '</span>';
      return pick ? '<button class="sc ' + (R.tab === idx ? 'on' : 'off') + '" style="' + st + '" data-act="rsTab" data-v="' + idx + '">' + inner + (R.tab === idx ? '<span class="sc-e">✎</span>' : '') + '</button>' : '<div class="sc" style="' + st + '">' + inner + '</div>';
    }).filter(Boolean).join('<div class="sc-vs">VS</div>');
  }
  function tableHtml(ti) {
    const t = teamAt(ti);
    if (!t) return '';
    const bg = t.color || '#2c5f2e', hs = 'background:' + esc(bg) + ';color:' + fg(bg);
    const body = t.members.map((m, mi) => {
      const s = sGet(m.key), id = 'rc-' + ti + '-' + mi + '-';
      return '<tr><td class="rs-name"><button class="rs-nbtn" data-act="rsPlayerMenu" data-t="' + ti + '" data-m="' + mi + '"><span class="nm">' + esc(m.name) + '</span>' + guestTag(m) + '</button></td>' + VIEW.map((c) => {
        if (c.t === 'pts') return '<td class="rs-ro rs-pts" id="' + id + 'pts">' + pts(s) + '</td>';
        if (c.t === 'pct') return '<td class="rs-ro" id="' + id + c.code + '">' + pct(s[c.m], s[c.a]) + '</td>';
        const v = s[c.k] || 0;
        return '<td class="rs-cell' + (v ? '' : ' zero') + '" id="' + id + c.k + '" data-act="rsBump" data-t="' + ti + '" data-m="' + mi + '" data-k="' + c.k + '">' + v + '</td>';
      }).join('') + '</tr>';
    }).join('') || '<tr><td class="rs-name">-</td><td colspan="' + VIEW.length + '" class="rs-none">선수를 추가해 주세요</td></tr>';
    const tot = totals(ti);
    const totCells = VIEW.map((c) => (c.t === 'pts' ? '<td class="rs-pts" id="rt-' + ti + '-pts">' + tot.pts + '</td>' : (c.t === 'pct' ? '<td class="rs-ro" id="rt-' + ti + '-' + c.code + '">' + pct(tot[c.m], tot[c.a]) + '</td>' : '<td id="rt-' + ti + '-' + c.k + '">' + (tot[c.k] || 0) + '</td>'))).join('');
    return '<div class="rs-tblwrap"><table class="rs-tbl"><thead>' +
      '<tr><th class="rs-name" style="' + hs + '">' + esc(t.label) + '팀</th>' + VIEW.map((c) => '<th style="' + hs + '">' + c.code + '</th>').join('') + '</tr>' +
      '<tr><th class="rs-name" style="' + hs + '">선 수</th>' + VIEW.map((c) => '<th class="ko" style="' + hs + '">' + c.ko.replace(' ', '<br>') + '</th>').join('') + '</tr>' +
      '</thead><tbody>' + body + '</tbody><tfoot><tr><td class="rs-name">합계</td>' + totCells + '</tr></tfoot></table></div>';
  }
  function renderSheet() {
    openFull(() => {
      Full.view = 'rs-sheet';
      R.wide = isWide();
      if (R.wide) R.tab = 0;
      if (R.tab >= R.match.length) R.tab = 0;
      const my = teamAt(R.match[0]);
      // 좁은 화면: 점수판을 눌러 팀 전환 / 넓은 화면: 두 팀을 위아래로 한 번에
      const tables = R.wide ? R.match.map(tableHtml).join('<div style="height:16px"></div>') : tableHtml(R.match[R.tab]);
      const modeBtns = '<button class="rs-mbtn' + (R.mode > 0 ? ' on' : '') + '" data-act="rsSetMode" data-v="1">＋ 입력</button><button class="rs-mbtn minus' + (R.mode < 0 ? ' on' : '') + '" data-act="rsSetMode" data-v="-1">－ 취소</button><button class="rs-tool warn" data-act="rsUndo">' + I.undo + ' 실행취소</button>';
      const tools1 = '<button class="rs-tool" data-act="rsColorDlg">' + I.shirt + ' 유니폼색</button><button class="rs-tool vid" data-act="rsVideo">' + I.video + ' 영상링크</button><button class="rs-tool" data-act="rsSetup">' + I.gear + ' 설정</button>';
      const tools2 = '<button class="rs-tool" data-act="rsAddPlayer">＋ 선수·게스트</button><button class="rs-tool go" data-act="rsSave">' + I.save + ' 게임 저장</button>';
      // PC(넓은 화면)는 웹 기록지처럼 두 줄: [점수판 | 입력 | 취소 | 실행취소] / [유니폼색 | 영상링크 | 설정 | 선수·게스트 | 게임 저장]
      const bar = R.wide
        ? '<div class="rs-row rs-top"><div class="rs-score" id="rsScore">' + scoreHtml() + '</div>' + modeBtns + '</div><div class="rs-row rs-tools">' + tools1 + tools2 + '</div>'
        : '<div class="rs-score" id="rsScore">' + scoreHtml() + '</div><div class="rs-row">' + modeBtns + '</div><div class="rs-row tight">' + tools1 + '</div><div class="rs-row tight">' + rotateBtn() + tools2 + '</div>';
      return '<div class="rs-toolbar' + (R.wide ? ' wide' : '') + (R.mode < 0 ? ' minus' : '') + '">' + head('' + I.note + ' 기록 입력', R.wide ? '<button class="rs-tool" data-act="rsClose">닫기</button>' : '', esc(R.date) + ' · ' + esc(R.day || '-') + ' · ' + R.game + '게임 · ' + I.pencil + ' ' + esc(recorder()) + (R.inMode === 'team' && my ? ' (' + esc(my.label) + '팀 담당)' : '')) +
        bar + '</div>' +
        '<div class="' + (R.mode < 0 ? 'rs-minus' : '') + '" id="rsTables">' + tables + '</div>' +
        '<p class="ps-note mt8">＋ 또는 －를 고른 뒤 칸을 누르면 개수가 오르내립니다. <b>성공</b>을 누르면 <b>시도</b>도 자동으로 함께 올라갑니다. 선수 이름을 누르면 팀 이동·제외를 할 수 있습니다.' +
        (R.wide ? '' : ' <b>위 점수판에서 팀을 누르면</b> 그 팀 기록지로 바뀝니다.') + '</p><div class="rs-foot"><button class="rs-tool" data-act="rsClose">닫기</button></div>';
    }).then(saveDraft); // 기록 화면에 들어갔다는 것까지 남겨 두면 이어서 입력 시 바로 이 화면으로 온다
  }
  A.rsTab = (el) => { R.tab = +el.dataset.v; refreshFull(); };
  A.rsSetMode = (el) => {
    R.mode = +el.dataset.v;
    const tb = $('#full .rs-toolbar'), box = $('#rsTables');
    if (tb) { tb.classList.toggle('minus', R.mode < 0); tb.querySelectorAll('.rs-mbtn').forEach((b) => b.classList.toggle('on', (+b.dataset.v > 0) === (R.mode > 0))); }
    if (box) box.classList.toggle('rs-minus', R.mode < 0);
  };
  function flash(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 360); }
  A.rsBump = (el) => {
    const ti = +el.dataset.t, mi = +el.dataset.m, key = el.dataset.k;
    const t = teamAt(ti), m = t && t.members[mi];
    if (!m) return;
    const s = sGet(m.key), d = R.mode;
    const ch = [[key, d]];
    if (ATT[key]) ch.push([ATT[key], d]); // 성공 +1 → 시도도 +1
    for (let i = 0; i < ch.length; i++) if ((s[ch[i][0]] || 0) + ch[i][1] < 0) { toast('0보다 작아질 수 없습니다', 'error'); return; }
    if (MADE[key] && d < 0 && (s[key] || 0) - 1 < (s[MADE[key]] || 0)) { toast('시도는 성공보다 적을 수 없습니다', 'error'); return; }
    ch.forEach((c) => { s[c[0]] = (s[c[0]] || 0) + c[1]; });
    R.hist.push({ key: m.key, ch });
    if (R.hist.length > 400) R.hist.shift();
    saveDraft(); syncRow(ti, mi); flash('rc-' + ti + '-' + mi + '-' + key); C.vibrate(12);
  };
  /* 바뀐 줄과 합계·점수판만 고쳐 그린다 */
  function syncRow(ti, mi) {
    const t = teamAt(ti), m = t && t.members[mi];
    if (!m) return;
    const s = sGet(m.key), tot = totals(ti);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; return el; };
    VIEW.forEach((c) => {
      if (c.t === 'pts') { set('rc-' + ti + '-' + mi + '-pts', pts(s)); set('rt-' + ti + '-pts', tot.pts); }
      else if (c.t === 'pct') { set('rc-' + ti + '-' + mi + '-' + c.code, pct(s[c.m], s[c.a])); set('rt-' + ti + '-' + c.code, pct(tot[c.m], tot[c.a])); }
      else { const el = set('rc-' + ti + '-' + mi + '-' + c.k, s[c.k] || 0); if (el) el.classList.toggle('zero', !s[c.k]); set('rt-' + ti + '-' + c.k, tot[c.k] || 0); }
    });
    const sc = $('#rsScore'); if (sc) sc.innerHTML = scoreHtml();
  }
  A.rsUndo = () => {
    const h = R.hist.pop();
    if (!h) { toast('되돌릴 입력이 없습니다', 'error'); return; }
    const s = sGet(h.key);
    h.ch.forEach((c) => { s[c[0]] = Math.max(0, (s[c[0]] || 0) - c[1]); });
    saveDraft();
    R.match.forEach((ti) => { const t = teamAt(ti); if (t) t.members.forEach((m, i) => { if (m.key === h.key) syncRow(ti, i); }); });
    toast('되돌렸습니다', 'success');
  };

  /* ===== 팀 이동 / 선수 추가·제외 ===== */
  A.rsPlayerMenu = (el) => {
    const ti = +el.dataset.t, mi = +el.dataset.m, t = teamAt(ti), m = t && t.members[mi];
    if (!m) return;
    const moves = R.teams.map((x, i) => (i === ti ? '' : '<button class="btn grow" data-act="rsMove" data-t="' + ti + '" data-m="' + mi + '" data-to="' + i + '">' + esc(x.label) + '팀으로</button>')).filter(Boolean).join('');
    modal('<h3>' + esc(m.name) + '</h3><p class="muted">현재 ' + esc(t.label) + '팀 · 이번 게임 ' + pts(sGet(m.key)) + '점</p><div class="row mt12" style="flex-wrap:wrap">' + (moves || '<span class="muted">이동할 다른 팀이 없습니다</span>') + '</div>' +
      '<div class="acts"><button class="btn gray" data-act="closeModal">취소</button><button class="btn danger" data-act="rsDropPlayer" data-t="' + ti + '" data-m="' + mi + '">이 게임에서 제외</button></div>');
  };
  A.rsMove = (el) => {
    const t = teamAt(+el.dataset.t), d = teamAt(+el.dataset.to);
    if (!t || !d) return;
    const m = t.members.splice(+el.dataset.m, 1)[0];
    if (m) d.members.push(m); // 기록은 선수 기준이라 이동해도 그대로 따라간다
    closeModal(); saveDraft(); refreshFull(); toast(m.name + ' → ' + d.label + '팀', 'success');
  };
  A.rsDropPlayer = (el) => {
    const t = teamAt(+el.dataset.t), m = t && t.members[+el.dataset.m];
    if (!m) return;
    t.members.splice(+el.dataset.m, 1); dropStats(m);
    closeModal(); saveDraft(); refreshFull(); toast(m.name + ' 제외됨', 'success');
  };
  /* 선수·게스트 추가. 회원: 이 날 참석자를 위에, 이름 일부만 쳐도 찾는다(성 빼도 됨). 게스트: 이름·포지션을 직접 */
  const AD = { type: 'member', team: 0, q: '', att: {} };
  A.rsAddPlayer = async (el) => {
    AD.type = 'member'; AD.q = '';
    AD.team = el.dataset.t != null ? +el.dataset.t : (R.match[R.tab] != null ? R.match[R.tab] : 0);
    AD.att = {};
    try { ((await Api.getAttendance(S.team.id)).list || []).forEach((a) => { if (a.days.length && a.days[0] !== 'none') AD.att[a.userId] = a.days.includes(R.dayId) ? 2 : 1; }); } catch (e) { /* 참석 표시 없이 */ }
    addDialog();
  };
  function addDialog() {
    const guest = AD.type === 'guest';
    const bg = modal('<h3>선수 · 게스트 추가</h3><label class="f">구분</label><div class="seg"><button data-ty="member" class="' + (guest ? '' : 'on') + '">회원</button><button data-ty="guest" class="' + (guest ? 'on' : '') + '">게스트</button></div>' +
      '<label class="f">팀</label><select class="in" id="rsNewTeam">' + R.teams.map((t, i) => '<option value="' + i + '"' + (i === AD.team ? ' selected' : '') + '>' + esc(t.label) + '팀</option>').join('') + '</select>' +
      (guest ? '<label class="f">이름</label><input class="in" id="rsNewName" maxlength="20" placeholder="게스트 이름" value="' + esc(AD.q) + '"><label class="f">포지션</label><select class="in" id="rsNewPos">' + Api.POSITIONS.map((x) => '<option>' + x + '</option>').join('') + '</select>' +
        '<p class="muted mt8">팀원 명단에 없는 사람입니다. 기록지에 <b>게</b> 표시로 구분됩니다.</p>'
        : '<label class="f">이름 (누르면 바로 추가)</label><input class="in" id="rsNewName" placeholder="이름 검색 (성 빼도 됨 · 게스트·휴식회원은 검색하면 나옵니다)" value="' + esc(AD.q) + '"><div class="pick mt12" id="rsNewList" style="max-height:38vh;overflow-y:auto"></div>') +
      '<div class="acts"><button class="btn gray" data-act="closeModal">취소</button>' + (guest ? '<button class="btn" id="rsNewOk">추가</button>' : '') + '</div>');
    const keep = () => { AD.q = $('#rsNewName').value; AD.team = +$('#rsNewTeam').value || 0; };
    bg.querySelectorAll('[data-ty]').forEach((b) => (b.onclick = () => { keep(); AD.type = b.dataset.ty; addDialog(); })); // 회원 ↔ 게스트 전환해도 이름·팀은 그대로
    const add = (m) => {
      keep();
      const dup = R.teams.find((t) => t.members.some((x) => x.key === m.key || x.name === m.name));
      if (dup) { toast(m.name + ' 은(는) 이미 ' + dup.label + '팀에 있습니다', 'error'); return; }
      R.teams[AD.team].members.push(m); sGet(m.key);
      closeModal(); saveDraft(); refreshFull(); toast(m.name + (m.guest ? ' (게스트) 추가됨' : ' 추가됨'), 'success');
    };
    if (guest) {
      $('#rsNewOk').onclick = () => { const n = $('#rsNewName').value.trim(); if (!n) { toast('이름을 입력하세요', 'error'); return; } add({ key: 'g:' + n, name: n, position: $('#rsNewPos').value, guest: true }); };
      setTimeout(() => $('#rsNewName') && $('#rsNewName').focus(), 60);
      return;
    }
    const inTeam = new Set(R.teams.reduce((v, t) => v.concat(t.members.map((m) => m.key)), []));
    const cand = S.team.members.filter((m) => !inTeam.has(m.userId)).sort((a, b) => ((AD.att[b.userId] || 0) - (AD.att[a.userId] || 0)) || a.name.localeCompare(b.name, 'ko'));
    const list = () => {
      const q = $('#rsNewName').value.replace(/\s+/g, '');
      // 기본은 정회원 + 이번 주 참석 체크한 사람. 그 밖(휴식회원·게스트)은 이름을 검색했을 때만
      const show = cand.filter((m) => (q ? m.name.replace(/\s+/g, '').indexOf(q) >= 0 : (m.memberType === '정회원' || AD.att[m.userId])));
      $('#rsNewList').innerHTML = show.length ? show.map((m) => '<button data-k="' + esc(m.userId) + '">' + (C.POS_LBL[m.position] || '-') + ' ' + esc(m.name) +
        (AD.att[m.userId] ? ' <small>' + (AD.att[m.userId] === 2 ? '참석' : '이번 주 참석') + '</small>' : '') + (m.memberType !== '정회원' ? ' <small>(' + esc(m.memberType) + ')</small>' : '') + '</button>').join('')
        : '<p class="empty">' + (q ? '\'' + esc(q) + '\' 이(가) 들어간 이름이 없습니다. 팀원이 아니면 게스트로 추가하세요' : '추가할 팀원이 없습니다') + '</p>';
      bg.querySelectorAll('#rsNewList button').forEach((b) => (b.onclick = () => { const m = cand.find((x) => x.userId === b.dataset.k); add({ key: m.userId, name: m.name, position: m.position || '', guest: false }); }));
    };
    $('#rsNewName').addEventListener('input', list);
    list();
  }

  /* ===== 저장 ===== */
  A.rsSave = async () => {
    if (R.busy) return;
    const teams = R.match.map(teamAt).filter(Boolean).map((t) => ({ name: t.label, color: t.color || '', players: t.members.map((m) => ({ key: m.key, name: m.name, guest: m.guest, position: m.position })) }));
    if (!teams.some((t) => t.players.length)) { toast('저장할 선수가 없습니다', 'error'); return; }
    if (!canEdit(R.date)) { modal('<p class="muted">팀원은 경기 당일 기록만 저장할 수 있습니다.<br>지난 기록은 대표나 임원이 저장합니다.<br>(입력 내용은 기기에 임시 저장되어 있습니다)</p><div class="acts"><button class="btn" data-act="closeModal">확인</button></div>'); return; }
    R.busy = true;
    try {
      const r = await Api.saveGame(S.team.id, { date: R.date, day: R.day, gameNo: R.game, teams, stats: R.stats, scope: R.inMode === 'team' ? 'team' : 'all' });
      clearDraft(); R.gameTouched = false; // 진행 현황을 새로 받아 다음 게임 번호를 다시 잡는다
      modal('<h3>' + I.check + ' 저장 완료</h3><p class="muted">저장되었습니다.<br>' + esc(R.date + ' ' + (R.day || '') + ' ' + R.game + '게임' + (R.inMode === 'team' ? ' · ' + teams[0].name + '팀' : '') + ' (' + r.count + '명)') + '<br>기록자 ' + esc(recorder()) + '</p>' +
        '<div class="acts"><button class="btn gray" data-act="closeModal">계속 수정</button><button class="btn line" data-act="rsVideo">' + I.video + ' 영상 링크</button><button class="btn" data-act="rsNext">다음 게임 →</button></div>');
    } catch (e) {
      modal('<p class="muted">' + esc(e.message || '저장에 실패했습니다.') + '<br>입력 내용은 기기에 임시 저장되어 있습니다.</p><div class="acts"><button class="btn" data-act="closeModal">확인</button></div>');
    } finally { R.busy = false; }
  };
  A.rsNext = () => {
    closeModal();
    R.game++; R.stats = {}; R.hist = [];
    R.teams.forEach((t) => t.members.forEach((m) => sGet(m.key)));
    saveDraft(); renderSetup();
  };
  /* ===== 영상 링크 등록 (기록지에서 바로) =====
     영상은 경기(게임)마다 따로 넣는다. 한 영상에 여러 경기가 있어도 게임별로 &t=초 만 달리 해서 넣는다. */
  const VD = { map: {}, game: 1 };
  A.rsVideo = async () => {
    if (!R.date) { toast('날짜를 먼저 선택해 주세요', 'error'); return; }
    VD.game = R.game;
    try { VD.map = vidMap((await Api.listVideos(S.team.id)).filter((v) => v[0] === R.date)); } catch (e) { VD.map = {}; }
    const bg = modal('<h3>' + I.video + ' 영상 링크</h3><p class="muted">' + esc(R.date) + (R.day ? ' · ' + esc(R.day) : '') + '<br>유튜브 주소를 붙여넣으면 <b>선수 기록</b>과 <b>날짜별 보기</b>에서 ' + I.play + ' 로 바로 열립니다.<br>영상 하나에 여러 경기가 있으면 경기마다 주소 끝 <b>&amp;t=1200</b>(초)만 다르게 넣어 주세요.</p>' +
      '<label class="f">게임 번호</label><div class="rs-inline"><input class="in" type="number" id="rsVidGame" min="1" max="99" value="' + VD.game + '" style="width:90px"><span class="muted">게임 영상</span></div>' +
      '<label class="f">영상 주소</label><input class="in" type="url" id="rsVidUrl" placeholder="https://youtu.be/..." value="' + esc(VD.map[vidKey(R.date, VD.game)] || '') + '"><p class="muted mt8">비워 두고 저장하면 등록된 링크가 삭제됩니다.</p>' +
      '<div class="acts"><button class="btn gray" data-act="closeModal">취소</button><button class="btn" id="rsVidSave">저장</button></div>');
    const g = $('#rsVidGame'), inp = $('#rsVidUrl');
    g.addEventListener('change', () => { VD.game = Math.max(1, parseInt(g.value, 10) || 1); g.value = VD.game; inp.value = VD.map[vidKey(R.date, VD.game)] || ''; });
    bg.querySelector('#rsVidSave').onclick = async () => {
      const raw = inp.value.trim(), url = raw ? vidNorm(raw) : '';
      if (raw && !url) { toast('영상 주소를 확인해 주세요', 'error'); return; }
      VD.game = Math.max(1, parseInt(g.value, 10) || 1);
      await C.run(Api.saveVideo(S.team.id, R.date, VD.game, url));
      closeModal(); toast(VD.game + '게임 ' + (url ? '영상 링크를 저장했습니다' : '영상 링크를 삭제했습니다'), 'success');
    };
  };
  // 입력 칸 값이 바뀔 때: 게임 번호, 유니폼색 직접 고르기
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'rsGameInput') { R.game = Math.max(1, parseInt(el.value, 10) || 1); R.gameTouched = true; saveDraft(); refreshFull(); }
    else if (el.classList && el.classList.contains('rs-colorin')) setColor(+el.dataset.t, el.value);
  });

  /* =========================================================
   *  선수 기록 (목록 → 선수별 / 날짜별)
   * ========================================================= */
  function openSummary() {
    openFull(async () => {
      Full.view = 'ps-sum';
      const t = S.team;
      if (Api.refresh) Api.refresh(5000);
      const games = S.games = await Api.listGames(t.id);
      S.vid = vidMap(await Api.listVideos(t.id));
      // 선수 기록 / 선수 지표를 버튼으로 나눈다 (한 화면에 표 하나 → 표 안에서 스크롤하며 머리줄 고정)
      const tab = C.psState().tab === 'av' ? 'av' : 'rec';
      const seg = '<div class="ps-seg" role="tablist">' + [['rec', I.trend + ' 선수 기록'], ['av', I.chart + ' 선수 지표']].map((x) =>
        '<button role="tab" class="' + (tab === x[0] ? 'on' : '') + '" data-act="psTab" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
      return head('' + I.trend + ' 선수 기록', rotateBtn() + '<button class="rs-tool" data-act="psCal">' + I.calendar + ' 날짜별 보기</button>') + seg + C.playerStatsHtml(t, games, tab) + '<div class="rs-foot"><button class="rs-tool" data-act="fullClose">닫기</button></div>';
    });
  }
  A.psOpen = openSummary;
  A.psTab = (el) => { C.psState().tab = el.dataset.v; openFull(Full.fn); }; // 다른 표로 바꾸면 맨 위부터
  A.psSort = (el) => { const st = C.psState(); st.sort = st.sort === el.dataset.v ? null : el.dataset.v; refreshFull(); }; // 같은 머리글을 다시 누르면 원래 순서
  A.avSort = (el) => { const st = C.psState(), k = 'av_' + el.dataset.w; st[k] = st[k] === el.dataset.v ? null : el.dataset.v; refreshFull(); };
  /* ===== 선수별 게임 기록 (선수 평가 + 게임별 + 합계·평균) ===== */
  A.psPlayer = (el) => {
    const key = el.dataset.k;
    openFull(() => {
      Full.view = 'ps-player';
      const d = Stats.player(S.games, key);
      const p = (S.psList || []).find((x) => x.key === key);
      const name = p ? p.name : (d.rows[0] || {}).name || '';
      const O = { W: '<b class="ps-win">승</b>', L: '<span class="ps-lose">패</span>', D: '무' };
      let hasVid = false;
      const body = d.rows.map((r) => {
        const vu = vidFind(S.vid, r.date, r.no); // 그 날짜·게임의 영상 (없으면 그 날 전체 영상)
        if (vu) hasVid = true;
        return C.psTr('g:' + r.gid) + '<td class="ps-name">' + (vu ? vidLink(vu, r.date) : esc(r.date)) + '</td><td>' + r.no + '</td><td>' + chip(r.team || '-', r.color) + '</td><td>' + (O[r.o] || '-') + '</td>' + C.psCells(r.s, r.pts, 1) + '</tr>';
      }).join('');
      const wr = (a) => (Stats.winRate(a) < 0 ? '-' : '승률 ' + Math.round(Stats.winRate(a) * 100) + '%');
      const s = d.all, rc = d.recent, P = Stats.PER;
      const foot = '<tfoot>' + C.psTr('f:sum') + '<td class="ps-name">합계</td><td colspan="2">' + s.days + '일 / ' + s.games + '게임</td><td>' + Stats.winLabel(s) + '</td>' + C.psCells(s.totals, s.pts, 1) + '</tr>' +
        C.psTr('f:avg') + '<td class="ps-name">' + P + '게임 평균</td><td colspan="2">전체 기간</td><td>' + wr(s) + '</td>' + C.psCells(s.totals, s.pts, (s.games || 1) / P) + '</tr>' +
        (rc.games ? C.psTr('f:recent') + '<td class="ps-name">최근 ' + Stats.DAYS + '일 ' + P + '게임 평균</td><td colspan="2">' + rc.days + '일 / ' + rc.games + '게임</td><td>' + wr(rc) + '</td>' + C.psCells(rc.totals, rc.pts, rc.games / P) + '</tr>' : '') + '</tfoot>';
      return head('' + I.trend + ' ' + esc(name), rotateBtn() + '<button class="rs-tool" data-act="psOpen">← 목록으로</button>') + C.psEvalCard((S.psEvals || {})[key]) +
        (hasVid ? '<p class="ps-note"><span class="ps-yt">' + I.play + ' 날짜</span>를 누르면 그 경기 영상이 열립니다.</p>' : '') +
        (d.rows.length ? '<div class="ps-wrap ps-fix"><table class="ps-tbl"><thead>' + viewHead('<th class="ps-name">날짜</th><th>게임</th><th>팀</th><th>승패</th>') + '</thead><tbody>' + body + '</tbody>' + foot + '</table></div>' +
          '<p class="ps-note mt8">평균은 ' + P + '게임 기준(1게임 평균 × ' + P + ')입니다. 숫자 칸을 누르면 그 줄이 노랗게 표시됩니다.</p>' : '<div class="rs-warn">기록이 없습니다.</div>') +
        '<div class="rs-foot"><button class="rs-tool" data-act="fullClose">닫기</button></div>';
    });
  };
  /* ===== 날짜별 보기 (달력) ===== */
  A.psCal = () => {
    const dates = Stats.dates(S.games);
    if (!dates.length) { toast('저장된 경기 기록이 없습니다', 'error'); return; }
    const vd = {}; Object.keys(S.vid || {}).forEach((k) => { vd[k.split('|')[0]] = 1; });
    calOpen(dates[dates.length - 1], { title: '' + I.calendar + ' 날짜 선택', hint: '초록색 날짜에만 기록이 있습니다.' + (Object.keys(vd).length ? '<br>오른쪽 아래 ' + I.play + ' 표시는 영상 링크가 등록된 날짜입니다.' : ''),
      cell: (ds, d) => (dates.indexOf(ds) >= 0 ? '<div class="ps-cd has' + (vd[ds] ? ' vid' : '') + '" data-act="psPickDate" data-d="' + ds + '">' + d + '</div>' : '<div class="ps-cd">' + d + '</div>') });
  };
  A.psDaySort = (el) => { const ds = C.psState().day; ds.key = ds.key === el.dataset.v ? null : el.dataset.v; refreshFull(); };
  A.psPickDate = (el) => {
    const date = el.dataset.d;
    closeModal();
    openFull(() => {
      Full.view = 'ps-date';
      const st = C.psState(), r = Stats.day(S.games, date), P = Stats.PER;
      if (!st.day || st.day.date !== date) { st.day = { date, key: null }; st.av_day = null; }
      const dayVid = vidFind(S.vid, date, 0);
      // 선수별 이 날 평균(4게임 기준): 기본은 경기 수 → 승률 → 평균 득점 순. 머리글을 누르면 그 항목이 높은 순
      const dk = st.day.key, sv = C.psSortVal(dk), byName = (a, b) => a.name.localeCompare(b.name, 'ko');
      const players = r.players.slice().sort((a, b) => {
        if (dk === 'name') return byName(a, b);
        if (sv) { const d = sv(b) - sv(a); if (d) return d; }
        return (b.games - a.games) || (Stats.winRate(b) - Stats.winRate(a)) || (b.pts / (b.games || 1) - a.pts / (a.games || 1)) || byName(a, b);
      });
      const ths = Stats.thresholds(players);
      const th = (k, html, cls) => '<th class="' + (cls ? cls + ' ' : '') + 'ps-sort' + (dk === k ? ' on' : '') + '" data-act="psDaySort" data-v="' + k + '">' + html + (dk === k ? '<span class="ps-arw">▼</span>' : '') + '</th>';
      const dayHead = '<tr>' + th('name', '선수', 'ps-name') + th('games', '경기') + VIEW.map((c, i) => th('c' + i, c.code + C.psSub(c.ko))).join('') + '</tr>';
      const sumRows = players.map((p) => C.psTr('n:' + p.key) + C.psNameCell(p) + '<td>' + p.games + '</td>' + C.psSumCells(p, ths) + '</tr>').join('');
      // 게임·팀별 기록지 (팀내 최고 수치 강조)
      const detail = r.groups.map((gp) => {
        const maxes = Stats.teamMaxes(gp.rows), tot = new Array(KEYS.length).fill(0);
        let sum = 0;
        const body = gp.rows.map((x) => { x.totals.forEach((v, i) => { tot[i] += v; }); sum += x.pts; return C.psTr('n:' + x.key) + '<td class="ps-name">' + esc(x.name) + (x.guest ? '<span class="rs-g">게</span>' : '') + '</td>' + C.psCells(x.totals, x.pts, 1, maxes) + '</tr>'; }).join('');
        const gv = vidFind(S.vid, date, gp.game);
        return '<div class="ps-gtitle" style="background:' + esc(gp.color || '#8d8d8d') + ';color:' + fg(gp.color || '#8d8d8d') + '"><span>' + gp.game + '게임 · ' + esc(gp.team) + '팀</span>' + (gv ? vidLink(gv, '영상', 'ps-ytg') : '') + '</div>' +
          '<div class="ps-wrap"><table class="ps-tbl"><thead>' + viewHead('<th class="ps-name">선수</th>') + '</thead><tbody>' + body + '</tbody><tfoot><tr><td class="ps-name">합계</td>' + C.psCells(tot, sum, 1) + '</tr></tfoot></table></div>';
      }).join('');
      const key = (cls, tx) => '<span class="' + cls + ' ps-key">' + tx + '</span>';
      return head('' + I.trend + ' ' + esc(date) + (r.day ? ' (' + esc(r.day) + ')' : ''), rotateBtn() + (dayVid ? vidLink(dayVid, '영상 보기', 'rs-tool vid') : '') + '<button class="rs-tool" data-act="psCal">' + I.calendar + ' 다른 날짜</button><button class="rs-tool" data-act="psOpen">← 목록으로</button>') +
        '<div class="card"><div class="ps-note"><b>참석자 ' + r.names.length + '명</b> (게스트 포함)</div>' + (r.names.length ? '<div class="ps-chiprow">' + r.names.map((n) => '<span class="ps-chip">' + esc(n) + '</span>').join('') + '</div>' : '<div class="rs-warn">이 날짜의 기록이 없습니다.</div>') +
        '<p class="ps-note"><b>선수별 이 날 평균</b>은 이 날 뛴 게임의 <b>' + P + '게임 기준 평균</b>(1게임 평균 × ' + P + ')입니다.</p>' +
        C.psDetails('note', '' + I.book + ' 표 보는 법', '<p class="ps-note"><b>경기 수가 많은 순</b> → 같으면 <b>승률이 높은 순</b> → 같으면 <b>득점이 높은 순</b>으로 정렬되며, <b>표 머리글(항목)을 누르면 그 항목이 높은 순</b>으로 바뀝니다. (한 번 더 누르면 원래 순서)<br>' +
          '<b>숫자 칸을 누르면 그 선수 줄이 노랗게 표시</b>되고, 아래 게임별 표에서도 같은 선수가 함께 표시됩니다.<br>' + key('ps-top', '초록색') + '은 해당 항목 상위 10%, ' + key('ps-bad', '빨간색') + '은 턴오버·반칙 상위 10%입니다.<br>' +
          '아래 게임별 표에서 ' + key('ps-top', '초록색') + '은 팀내 최고 수치, ' + key('ps-bad', '빨간색') + '은 팀내 최다 턴오버·반칙입니다. (시도 개수는 제외)</p>') +
        (sumRows ? '<h2 class="mt12">선수별 이 날 평균 (' + P + '게임 기준)</h2><div class="ps-wrap"><table class="ps-tbl"><thead>' + dayHead + '</thead><tbody>' + sumRows + '</tbody></table></div>' + C.avTableHtml(players, 'day') : '') +
        detail + '</div><div class="rs-foot"><button class="rs-tool" data-act="fullClose">닫기</button></div>';
    });
  };

  resetR();
  C.boot();
})();
