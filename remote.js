/* =========================================================
 *  서버 연결 (Supabase 서버 함수 api)
 *  config.js 에 apiUrl 이 있으면 Api 의 함수들을 '서버에 물어보는 함수'로 바꾼다. 이름·결과 모양은 data.js 와 같아서 화면 코드는 그대로다.
 *  - 읽기: 서버가 한 화면에 필요한 자료를 묶음(bundle)으로 한 번에 준다 → 20초 동안은 다시 묻지 않는다
 *          경기 기록은 크므로, 앱이 가진 것보다 새것이 있을 때만 받는다 (gamesRev 번호로 비교)
 *  - 쓰기: 한 번 오가고, 답에 최신 묶음이 함께 온다
 *  권한 검사는 서버가 한다 (supabase/functions/api — 안에 www/data.js 가 그대로 들어 있다).
 * ========================================================= */
(function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  if (!cfg.apiUrl) return;
  const L = window.Api;                 // 상수·날짜 도구는 그대로 쓴다
  const AUTH_KEY = 'myhoop.auth.v2';
  const FRESH_MS = 20000;
  const BUNDLE_TEAM = ['getTeam', 'getAttendance', 'listGames', 'listVideos', 'listPosts', 'pendingRequests', 'lineupDates'];
  const BUNDLE_HOME = ['me', 'myMemberships'];
  const WRITES = ['setPrimary', 'createTeam', 'updateTeam', 'deleteTeam', 'requestJoin', 'cancelJoin', 'leaveTeam', 'decideJoin', 'updateMember', 'transferOwner', 'removeMember',
    'submitAttendance', 'resetWeek', 'addPost', 'deletePost', 'addComment', 'deleteComment', 'saveGame', 'deleteGame', 'saveLineup', 'saveVideo'];

  let auth = null;
  try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { /* 저장소 막힘 */ }
  let cache = {};        // 'fn|[args]' → { v } 또는 { e: 오류 문구 } (따로 물어 둔 답은 t 도 있다)
  let stamp = {};        // 묶음을 받은 때: '' = 공통, teamId = 그 팀
  let rev = {};          // 팀마다 가진 경기 기록의 번호
  let team = '';         // 지금 보고 있는 팀 (쓰기 뒤에 이 팀의 최신 묶음을 받는다)
  const pending = {};    // 같은 묶음을 동시에 두 번 부르지 않게
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const key = (fn, args) => fn + '|' + JSON.stringify(args);
  const gamesKey = (t) => key('listGames', [t]);
  const grOf = (t) => (t && cache[gamesKey(t)] && rev[t] != null ? rev[t] : null); // 경기 목록을 가지고 있을 때만 번호를 보낸다

  let busy = 0;
  const setBusy = (d) => { busy += d; document.body.classList.toggle('net-busy', busy > 0); };
  async function post(body) {
    setBusy(1);
    try {
      let j;
      try {
        // text/plain 으로 보내면 브라우저가 사전 확인(preflight) 없이 바로 보낸다
        const r = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ v: 2, auth }, body)) });
        j = await r.json();
      } catch (e) { throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요'); }
      if (!j.ok) {
        if (j.message === 'AUTH') { signOut(); if (window.AppCtx) window.AppCtx.boot(); throw new Error('다시 로그인해 주세요'); }
        throw new Error(j.message || '서버 오류');
      }
      return j;
    } finally { setBusy(-1); }
  }
  function signOut() { auth = null; cache = {}; stamp = {}; rev = {}; team = ''; try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* 무시 */ } }
  function takeBundle(j, t) {
    if (!j || !j.bundle) return;
    Object.keys(j.bundle).forEach((k) => { cache[k] = j.bundle[k]; });
    if (t && j.gamesRev != null) rev[t] = j.gamesRev;
    const now = Date.now();
    stamp[''] = now; if (t) stamp[t] = now;
  }
  function fetchBundle(t) {
    const k = t || '';
    if (!pending[k]) pending[k] = post({ op: 'bundle', team: k, gr: grOf(k) }).then((j) => { takeBundle(j, k); }).finally(() => { delete pending[k]; });
    return pending[k];
  }
  const answer = (c) => { if (c.e) throw new Error(c.e); return clone(c.v); };
  async function read(fn, args) {
    const k = key(fn, args);
    const isTeam = BUNDLE_TEAM.indexOf(fn) >= 0 && args.length === 1, isHome = BUNDLE_HOME.indexOf(fn) >= 0;
    if (isTeam) team = args[0];
    const scope = isTeam ? args[0] : '';
    if (isTeam || isHome) {
      if (!cache[k] || Date.now() - (stamp[scope] || 0) > FRESH_MS) await fetchBundle(isTeam ? args[0] : team);
      if (cache[k]) return answer(cache[k]);
    } else if (cache[k] && Date.now() - cache[k].t < FRESH_MS) return answer(cache[k]);
    // 묶음에 없는 읽기(저장된 팀 배정 등)는 따로 묻는다
    const j = await post({ op: 'call', fn, args, team });
    cache[k] = { v: j.v, t: Date.now() };
    return clone(j.v);
  }
  async function write(fn, args) {
    const j = await post({ op: 'call', fn, args, team, gr: grOf(team) });
    Object.keys(cache).forEach((k) => { if (cache[k].t) delete cache[k]; }); // 따로 물어 둔 답은 낡았을 수 있다
    takeBundle(j, j.team || team);
    return clone(j.v);
  }

  const Api = { mode: 'server', SIDO: L.SIDO, WEEKDAYS: L.WEEKDAYS, POSITIONS: L.POSITIONS, MEMBER_TYPES: L.MEMBER_TYPES, STAT_KEYS: L.STAT_KEYS, util: L.util };
  ['me', 'myMemberships', 'getTeam', 'pendingRequests', 'getAttendance', 'listPosts', 'listGames', 'getLineup', 'lineupDates', 'listVideos'].forEach((fn) => { Api[fn] = function () { return read(fn, [].slice.call(arguments)); }; });
  WRITES.forEach((fn) => { Api[fn] = function () { return write(fn, [].slice.call(arguments)); }; });
  Api.me = async () => { if (!auth) return null; try { return await read('me', []); } catch (e) { if (!auth) return null; throw e; } };
  /* 팀 찾기: 지역·검색어로 서버가 거른다 (같은 조건은 20초 동안 다시 묻지 않는다) */
  Api.listTeams = async (opt) => {
    const o = opt || {}, sido = String(o.sido || ''), q = String(o.q || '').trim();
    const k = key('listTeams', [sido, q]);
    if (cache[k] && Date.now() - cache[k].t < FRESH_MS) return clone(cache[k].v);
    const j = await post({ op: 'teams', sido, q });
    cache[k] = { v: j.v, t: Date.now() };
    return clone(j.v);
  };
  /* 임시 로그인: 이름(실명) + 비밀번호 (signup = 새로 가입, extra = 선택 정보 { position, number }) */
  Api.login = async (provider, nickname, password, signup, extra) => {
    const j = await post({ op: 'login', nickname, password, signup: !!signup, extra: extra || null });
    signOut(); auth = j.auth;
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) { /* 무시 */ }
    return j.user;
  };
  Api.logout = async () => { signOut(); return true; };
  Api.deleteAccount = async () => { await post({ op: 'call', fn: 'deleteAccount', args: [] }); signOut(); return true; };
  Api.demoAccounts = async () => [];
  Api.resetDemo = async () => { throw new Error('서버에 연결된 앱에서는 쓸 수 없습니다'); };
  /* 받은 지 ms 가 지난 묶음은 다음에 읽을 때 서버에서 새로 받게 한다 (ms 를 안 주면 모두) */
  Api.refresh = (ms) => {
    const now = Date.now();
    Object.keys(stamp).forEach((k) => { if (!ms || now - stamp[k] > ms) delete stamp[k]; });
    Object.keys(cache).forEach((k) => { if (cache[k].t && (!ms || now - cache[k].t > ms)) delete cache[k]; });
  };
  window.Api = Api;
})();
