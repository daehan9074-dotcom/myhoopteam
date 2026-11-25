/* =========================================================
 *  데이터 계층 (Api)
 *  이 파일 하나가 두 곳에서 돈다.
 *   1) 앱(체험판): 기기 안(localStorage)에 저장
 *   2) Supabase 서버 함수(api): tools/make-edge.js 가 이 파일을 supabase/functions/api/core.js 로 그대로 옮긴다 (HOOP_ENV 가 있을 때)
 *  권한 규칙(팀원만 공지·한마디·게시판 보기, 관리자만 수락 등)을 여기 한 곳에서 검사하므로
 *  이 파일을 고치면 서버 코드도 다시 만들어 배포해야 한다. 브라우저 전용 기능(window·localStorage)은 ENV 가 없을 때만 쓴다.
 * ========================================================= */
(function () {
  'use strict';
  const ENV = (typeof HOOP_ENV === 'object' && HOOP_ENV) || null; // 서버에서 돌 때만 있다: { db, dirty }
  const KEY = 'myhoop.db.v1';

  const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const POSITIONS = ['가드', '포워드', '센터'];
  const MEMBER_TYPES = ['정회원', '게스트', '휴식회원'];
  // 코모도 웹페이지 기록지와 같은 13종: ~m = 성공, ~a = 시도, tov = 턴오버, pf = 반칙, bc = 바스켓카운트
  const STAT_KEYS = ['p2m', 'p2a', 'p3m', 'p3a', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'bc'];

  /* ---------- 기본 도구 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const ok = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 40)); // 서버 왕복 흉내
  const fail = (msg) => Promise.reject(new Error(msg));
  const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max || 200);

  function weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 월요일 시작
    return x;
  }
  const weekKey = (d) => ymd(weekStart(d || new Date()));
  function dayDate(weekday, base) {
    const ws = weekStart(base || new Date());
    const x = new Date(ws);
    x.setDate(ws.getDate() + ((weekday + 6) % 7));
    return x;
  }
  function dayView(day) {
    const dt = dayDate(day.weekday);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      id: day.id, weekday: day.weekday, time: day.time || '', end: day.end || '', place: day.place || '',
      date: ymd(dt),
      title: (dt.getMonth() + 1) + '/' + dt.getDate() + '(' + WEEKDAYS[day.weekday] + ')' + (day.time ? ' ' + day.time + (day.end ? '~' + day.end : '') : ''),
      passed: dt < today
    };
  }

  /* ---------- 저장소 ---------- */
  function load() {
    if (ENV) return ENV.db;
    try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* 저장소 막힘 */ }
    return null;
  }
  let db = load() || seed();
  function save() { if (ENV) { ENV.dirty = true; return; } try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 무시 */ } }
  upgradeDemo();
  upgradeShape();

  /* 0.2.0: 팀 배정 저장·영상 링크 칸을 만들고, 옛 기록(성공/실패 칸)을 웹페이지 기록지와 같은 13종(성공/시도)으로 바꾼다 */
  function upgradeShape() {
    let changed = false;
    if (!db.lineups) { db.lineups = []; changed = true; }
    if (!db.videos) { db.videos = []; changed = true; }
    Object.values(db.teams).forEach((t) => { if (!t.checkItems) { t.checkItems = defaultChecks(); changed = true; } });
    db.memberships.forEach((m) => {
      const p = m.profile || (m.profile = {});
      if (!p.checks) { p.checks = { paid: !!p.paid, registered: !!p.registered }; delete p.paid; delete p.registered; changed = true; }
      if (p.memberType === '휴활') { p.memberType = '휴식회원'; changed = true; } // 0.5.1: 이름 바꿈
    });
    db.games.forEach((g) => Object.keys(g.stats || {}).forEach((k) => {
      const o = g.stats[k] || {};
      if ('p2m' in o) return;
      const p2 = o.p2 || 0, p3 = o.p3 || 0, ft = o.ft || 0;
      g.stats[k] = { p2m: p2, p2a: p2 + (o.p2x || 0), p3m: p3, p3a: p3 + (o.p3x || 0), ftm: ft, fta: ft + (o.ftx || 0),
        reb: o.reb || 0, ast: o.ast || 0, stl: o.stl || 0, blk: o.blk || 0, tov: o.tov || 0, pf: o.pf || 0, bc: 0 };
      changed = true;
    }));
    if (changed) save();
  }

  /* 옛 형식의 예시 경기를 새 예시 경기(4일 × 4게임, 웹페이지 기록지 칸)로 바꾼다. 직접 만든 팀의 기록은 건드리지 않는다 */
  function upgradeDemo() {
    let changed = false;
    Object.values(db.teams).filter((t) => t.demo).forEach((t) => {
      const old = db.games.filter((g) => g.teamId === t.id && /^g_demo/.test(g.id));
      if (!old.length || old.some((g) => Object.values(g.stats || {}).some((s) => s && 'bc' in s))) return;
      const players = db.memberships.filter((m) => m.teamId === t.id && m.status === 'active').map((m) => ({ key: m.userId, name: (m.profile || {}).name || '이름 없음', guest: false }));
      if (players.length < 4) return;
      db.games = db.games.filter((g) => old.indexOf(g) < 0).concat(demoGames(t.id, +t.id.replace(/\D/g, '') || 1, players, old[0].recorder));
      changed = true;
    });
    if (changed) save();
  }

  /* ---------- 권한 도우미 (서버의 행 단위 보안 규칙과 같은 기준) ---------- */
  const me = () => (db.session ? db.users[db.session] || null : null);
  const memOf = (teamId, userId) => db.memberships.find((m) => m.teamId === teamId && m.userId === userId) || null;
  const myMem = (teamId) => { const u = me(); return u ? memOf(teamId, u.id) : null; };
  const isActive = (teamId) => { const m = myMem(teamId); return !!(m && m.status === 'active'); };
  const isAdmin = (teamId) => { const m = myMem(teamId); return !!(m && m.status === 'active' && (m.role === 'owner' || m.role === 'admin')); };
  const isOwner = (teamId) => { const m = myMem(teamId); return !!(m && m.status === 'active' && m.role === 'owner'); };
  const activeMembers = (teamId) => db.memberships.filter((m) => m.teamId === teamId && m.status === 'active');
  function needLogin() { if (!me()) throw new Error('로그인이 필요합니다'); }
  function team(teamId) { const t = db.teams[teamId]; if (!t) throw new Error('없는 팀입니다'); return t; }

  function profileOut(m, full) {
    const p = m.profile || {};
    const o = { userId: m.userId, role: m.role, name: p.name || '이름 없음', number: p.number || '', position: p.position || '', memberType: p.memberType || '정회원' };
    if (full) { o.checks = Object.assign({}, p.checks); o.birthYear = p.birthYear || ''; o.joinedAt = m.joinedAt; }
    return o;
  }
  function sortMembers(list) {
    const rank = { owner: 0, admin: 1, member: 2 };
    const tr = { '정회원': 0, '게스트': 1, '휴식회원': 2 };
    return list.sort((a, b) => (rank[a.role] - rank[b.role]) || (tr[a.memberType] - tr[b.memberType]) || a.name.localeCompare(b.name, 'ko'));
  }

  function wrap(fn) { // 동기 함수 → 서버처럼 Promise 로 (서버 안에서는 그대로 돌려준다)
    if (ENV) return function () { return clone(fn.apply(null, arguments)); };
    return function () {
      try { const v = fn.apply(null, arguments); return ok(v); } catch (e) { return fail(e.message); }
    };
  }

  /* =========================================================
   *  Api
   * ========================================================= */
  const Api = {
    mode: 'local',
    SIDO, WEEKDAYS, POSITIONS, MEMBER_TYPES, STAT_KEYS,
    util: { ymd, weekKey, dayView },

    /* ----- 로그인 (지금은 체험용 흉내. 실제는 카카오/애플 로그인 결과로 대체) ----- */
    me: wrap(() => me()),
    demoAccounts: wrap(() => Object.values(db.users).map((u) => ({ id: u.id, nickname: u.nickname, provider: u.provider }))),
    login: wrap((provider, nickname) => {
      const nick = clean(nickname, 20);
      if (!nick) throw new Error('이름을 입력하세요');
      let u = Object.values(db.users).find((x) => x.provider === provider && x.nickname === nick);
      if (!u) { u = { id: uid('u'), provider, nickname: nick, createdAt: Date.now() }; db.users[u.id] = u; }
      db.session = u.id; save();
      return u;
    }),
    logout: wrap(() => { db.session = null; save(); return true; }),
    deleteAccount: wrap(() => {
      needLogin();
      const u = me();
      db.memberships.filter((m) => m.userId === u.id && m.role === 'owner' && m.status === 'active').forEach((m) => {
        const next = activeMembers(m.teamId).filter((x) => x.userId !== u.id)
          .sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.joinedAt - b.joinedAt)[0];
        if (next) next.role = 'owner'; else removeTeamData(m.teamId);
      });
      db.memberships = db.memberships.filter((m) => m.userId !== u.id);
      db.attendance = db.attendance.filter((a) => a.userId !== u.id);
      db.posts.forEach((p) => { if (p.userId === u.id) { p.userId = null; p.name = '탈퇴 회원'; } (p.comments || []).forEach((c) => { if (c.userId === u.id) { c.userId = null; c.name = '탈퇴 회원'; } }); });
      db.games.forEach((g) => g.teams.forEach((t) => t.players.forEach((pl) => { if (pl.key === u.id) { pl.key = 'x_' + uid('d'); pl.name = '탈퇴 회원'; } })));
      delete db.users[u.id];
      if (db.prefs) delete db.prefs[u.id];
      db.session = null; save();
      return true;
    }),

    /* ----- 내 소속 ----- */
    myMemberships: wrap(() => {
      const u = me(); if (!u) return [];
      const primary = (db.prefs[u.id] || {}).primaryTeamId;
      return db.memberships.filter((m) => m.userId === u.id && db.teams[m.teamId]).map((m) => ({
        teamId: m.teamId, teamName: db.teams[m.teamId].name, teamLogo: db.teams[m.teamId].logo || '', sido: db.teams[m.teamId].sido,
        role: m.role, status: m.status, primary: m.teamId === primary
      }));
    }),
    setPrimary: wrap((teamId) => { needLogin(); if (!isActive(teamId)) throw new Error('소속 팀만 기본 팀으로 정할 수 있습니다'); db.prefs[me().id] = { primaryTeamId: teamId }; save(); return true; }),

    /* ----- 팀 ----- */
    listTeams: wrap((opt) => {
      const o = opt || {};
      const q = clean(o.q, 30).toLowerCase();
      return Object.values(db.teams)
        .filter((t) => (!o.sido || t.sido === o.sido) && (!q || (t.name + ' ' + t.area).toLowerCase().includes(q)))
        .map((t) => {
          const m = myMem(t.id);
          return { id: t.id, name: t.name, sido: t.sido, area: t.area, intro: t.intro, logo: t.logo || '', kba: t.kba || '', memberCount: activeMembers(t.id).length, myStatus: m ? m.status : '', myRole: m ? m.role : '', demo: !!t.demo };
        })
        .sort((a, b) => (b.myStatus ? 1 : 0) - (a.myStatus ? 1 : 0) || b.memberCount - a.memberCount);
    }),
    getTeam: wrap((teamId) => {
      const t = team(teamId);
      const m = myMem(teamId);
      const member = isActive(teamId);
      const v = {
        id: t.id, name: t.name, sido: t.sido, area: t.area, intro: t.intro, demo: !!t.demo, logo: t.logo || '', logoStyle: cleanLogoStyle(t.logoStyle), kba: t.kba || '', theme: cleanTheme(t.theme),
        checkItems: member ? clone(t.checkItems || []) : [],
        days: t.days.map(dayView),
        memberCount: activeMembers(teamId).length,
        my: m ? { status: m.status, role: m.role, profile: profileOut(m, true) } : null,
        isMember: member, isAdmin: isAdmin(teamId), isOwner: isOwner(teamId),
        // 다른 팀 사람에게는 공지·회비·선수등록을 내려주지 않는다
        notice: member ? (t.notice || '') : null,
        members: sortMembers(activeMembers(teamId).map((x) => profileOut(x, member)))
      };
      if (v.isAdmin) v.pendingCount = db.memberships.filter((x) => x.teamId === teamId && x.status === 'pending').length;
      return v;
    }),
    createTeam: wrap((data) => {
      needLogin();
      const name = clean(data.name, 30);
      if (!name) throw new Error('팀 이름을 입력하세요');
      if (!SIDO.includes(data.sido)) throw new Error('지역(시·도)을 선택하세요');
      if (data.kba !== 'yes' && data.kba !== 'no') throw new Error('대한민국농구협회 등록 팀인지 선택하세요');
      if (Object.values(db.teams).some((t) => t.name === name && t.sido === data.sido)) throw new Error('같은 지역에 같은 이름의 팀이 있습니다');
      const t = {
        id: uid('t'), name, sido: data.sido, area: clean(data.area, 40), intro: clean(data.intro, 300),
        createdBy: me().id, createdAt: Date.now(), notice: '', kba: data.kba, logo: cleanLogo(data.logo), checkItems: defaultChecks(),
        days: (data.days && data.days.length ? data.days : [{ weekday: 3, time: '20:00', place: '' }]).map((d) => ({ id: uid('d'), weekday: +d.weekday, time: clean(d.time, 10), end: clean(d.end, 10), place: clean(d.place, 40) }))
      };
      db.teams[t.id] = t;
      db.memberships.push({ teamId: t.id, userId: me().id, role: 'owner', status: 'active', joinedAt: Date.now(), message: '', profile: cleanProfile(data.profile, true) });
      if (!(db.prefs[me().id] || {}).primaryTeamId) db.prefs[me().id] = { primaryTeamId: t.id };
      save();
      return { id: t.id };
    }),
    updateTeam: wrap((teamId, patch) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 바꿀 수 있습니다');
      const t = team(teamId);
      if (patch.name != null) { const n = clean(patch.name, 30); if (!n) throw new Error('팀 이름을 입력하세요'); t.name = n; }
      if (patch.sido != null) { if (!SIDO.includes(patch.sido)) throw new Error('지역을 선택하세요'); t.sido = patch.sido; }
      if (patch.area != null) t.area = clean(patch.area, 40);
      if (patch.intro != null) t.intro = clean(patch.intro, 300);
      if (patch.notice != null) t.notice = clean(patch.notice, 2000);
      if (patch.logo != null) t.logo = cleanLogo(patch.logo);
      if (patch.theme !== undefined) t.theme = cleanTheme(patch.theme); // null = 기본 색으로
      if (patch.logoStyle !== undefined) t.logoStyle = cleanLogoStyle(patch.logoStyle);
      if (patch.kba != null) { if (patch.kba !== 'yes' && patch.kba !== 'no') throw new Error('협회 등록 여부를 선택하세요'); t.kba = patch.kba; }
      if (patch.checkItems) {
        const seen = {};
        t.checkItems = patch.checkItems.slice(0, 10).map((c) => ({ id: clean(c.id, 20) || uid('c'), label: clean(c.label, 12) }))
          .filter((c) => c.label && !seen[c.id] && (seen[c.id] = 1));
      }
      if (patch.days) {
        if (!patch.days.length) throw new Error('참석 요일을 하나 이상 두세요');
        t.days = patch.days.map((d) => ({ id: d.id || uid('d'), weekday: +d.weekday, time: clean(d.time, 10), end: clean(d.end, 10), place: clean(d.place, 40) }))
          .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
      }
      save();
      return true;
    }),
    deleteTeam: wrap((teamId) => { if (!isOwner(teamId)) throw new Error('대표만 팀을 삭제할 수 있습니다'); removeTeamData(teamId); save(); return true; }),

    /* ----- 가입 신청·수락 ----- */
    requestJoin: wrap((teamId, profile, message) => {
      needLogin(); team(teamId);
      const ex = myMem(teamId);
      if (ex) throw new Error(ex.status === 'active' ? '이미 소속된 팀입니다' : '이미 가입 신청을 했습니다');
      const p = cleanProfile(profile, false);
      if (!p.name) throw new Error('팀에서 쓸 이름을 입력하세요');
      db.memberships.push({ teamId, userId: me().id, role: 'member', status: 'pending', joinedAt: Date.now(), message: clean(message, 200), profile: p });
      save();
      return true;
    }),
    cancelJoin: wrap((teamId) => {
      const m = myMem(teamId);
      if (!m || m.status !== 'pending') throw new Error('대기 중인 신청이 없습니다');
      db.memberships.splice(db.memberships.indexOf(m), 1); save();
      return true;
    }),
    leaveTeam: wrap((teamId) => {
      const m = myMem(teamId);
      if (!m) throw new Error('소속된 팀이 아닙니다');
      if (m.role === 'owner' && activeMembers(teamId).length > 1) throw new Error('대표는 다른 팀원에게 대표를 넘긴 뒤 나갈 수 있습니다');
      if (m.role === 'owner') removeTeamData(teamId);
      else { db.memberships.splice(db.memberships.indexOf(m), 1); db.attendance = db.attendance.filter((a) => !(a.teamId === teamId && a.userId === m.userId)); }
      const pr = db.prefs[me().id]; if (pr && pr.primaryTeamId === teamId) delete db.prefs[me().id];
      save();
      return true;
    }),
    pendingRequests: wrap((teamId) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 볼 수 있습니다');
      return db.memberships.filter((m) => m.teamId === teamId && m.status === 'pending')
        .map((m) => ({ userId: m.userId, nickname: (db.users[m.userId] || {}).nickname || '', message: m.message, at: m.joinedAt, profile: profileOut(m, true) }));
    }),
    decideJoin: wrap((teamId, userId, approve) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 수락할 수 있습니다');
      const m = memOf(teamId, userId);
      if (!m || m.status !== 'pending') throw new Error('이미 처리된 신청입니다');
      if (approve) { m.status = 'active'; m.joinedAt = Date.now(); if (!(db.prefs[userId] || {}).primaryTeamId) db.prefs[userId] = { primaryTeamId: teamId }; }
      else db.memberships.splice(db.memberships.indexOf(m), 1);
      save();
      return true;
    }),

    /* ----- 팀원 관리 ----- */
    updateMember: wrap((teamId, userId, patch) => {
      const self = me() && me().id === userId;
      const admin = isAdmin(teamId);
      if (!admin && !(self && isActive(teamId))) throw new Error('권한이 없습니다');
      const m = memOf(teamId, userId);
      if (!m || m.status !== 'active') throw new Error('팀원이 아닙니다');
      const p = m.profile || (m.profile = {});
      if (patch.name != null) { const n = clean(patch.name, 20); if (!n) throw new Error('이름을 입력하세요'); p.name = n; }
      if (patch.number != null) p.number = clean(patch.number, 3).replace(/[^0-9]/g, '');
      if (patch.position != null) p.position = POSITIONS.includes(patch.position) ? patch.position : '';
      if (patch.birthYear != null) p.birthYear = clean(patch.birthYear, 4).replace(/[^0-9]/g, '');
      if (admin) { // 회비·선수등록·회원 구분은 관리자만
        if (patch.memberType != null && MEMBER_TYPES.includes(patch.memberType)) p.memberType = patch.memberType;
        if (patch.checks) { // 팀에 있는 항목만 받는다
          const t = team(teamId), c = p.checks || (p.checks = {});
          (t.checkItems || []).forEach((it) => { if (patch.checks[it.id] != null) c[it.id] = !!patch.checks[it.id]; });
        }
      }
      if (patch.role != null) {
        if (!isOwner(teamId)) throw new Error('관리자 지정은 대표만 할 수 있습니다');
        if (m.role === 'owner') throw new Error('대표의 역할은 대표 넘기기로 바꿉니다');
        m.role = patch.role === 'admin' ? 'admin' : 'member';
      }
      save();
      return true;
    }),
    transferOwner: wrap((teamId, userId) => {
      if (!isOwner(teamId)) throw new Error('대표만 넘길 수 있습니다');
      const m = memOf(teamId, userId);
      if (!m || m.status !== 'active') throw new Error('팀원에게만 넘길 수 있습니다');
      myMem(teamId).role = 'admin'; m.role = 'owner'; save();
      return true;
    }),
    removeMember: wrap((teamId, userId) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 내보낼 수 있습니다');
      const m = memOf(teamId, userId);
      if (!m) throw new Error('팀원이 아닙니다');
      if (m.role === 'owner') throw new Error('대표는 내보낼 수 없습니다');
      if (m.role === 'admin' && !isOwner(teamId)) throw new Error('관리자는 대표만 내보낼 수 있습니다');
      db.memberships.splice(db.memberships.indexOf(m), 1);
      db.attendance = db.attendance.filter((a) => !(a.teamId === teamId && a.userId === userId));
      save();
      return true;
    }),

    /* ----- 참석 ----- */
    getAttendance: wrap((teamId) => {
      const t = team(teamId);
      const wk = weekKey();
      const rows = db.attendance.filter((a) => a.teamId === teamId && a.week === wk);
      const counts = {};
      t.days.forEach((d) => { counts[d.id] = rows.filter((a) => a.days.includes(d.id)).length; });
      if (!isActive(teamId)) return { week: wk, counts, list: null, mine: null }; // 다른 팀: 인원수만
      const list = rows.map((a) => { const m = memOf(teamId, a.userId); return { userId: a.userId, name: m ? m.profile.name : '?', memberType: m ? m.profile.memberType : '', days: a.days, comment: a.comment, at: a.at }; })
        .sort((a, b) => a.at - b.at);
      return { week: wk, counts, list, mine: list.find((a) => a.userId === me().id) || null };
    }),
    submitAttendance: wrap((teamId, days, comment) => {
      if (!isActive(teamId)) throw new Error('팀원으로 수락된 뒤 참석 여부를 올릴 수 있습니다');
      const t = team(teamId);
      const valid = (days || []).filter((d) => d === 'none' || t.days.some((x) => x.id === d));
      if (!valid.length) throw new Error('참석 가능일을 선택하세요');
      const wk = weekKey();
      const finalDays = valid.includes('none') ? ['none'] : valid;
      let a = db.attendance.find((x) => x.teamId === teamId && x.userId === me().id && x.week === wk);
      if (!a) { a = { teamId, userId: me().id, week: wk }; db.attendance.push(a); }
      a.days = finalDays; a.comment = clean(comment, 200); a.at = Date.now();
      save();
      return true;
    }),
    resetWeek: wrap((teamId) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 초기화할 수 있습니다');
      const wk = weekKey();
      db.attendance = db.attendance.filter((a) => !(a.teamId === teamId && a.week === wk));
      save();
      return true;
    }),

    /* ----- 게시판 (팀원만) ----- */
    listPosts: wrap((teamId) => {
      if (!isActive(teamId)) throw new Error('팀원에게만 공개됩니다');
      const uidMe = me().id;
      return db.posts.filter((p) => p.teamId === teamId).sort((a, b) => b.at - a.at).map((p) => ({
        id: p.id, name: p.name, body: p.body, at: p.at, mine: p.userId === uidMe,
        comments: (p.comments || []).map((c) => ({ id: c.id, name: c.name, body: c.body, at: c.at, mine: c.userId === uidMe }))
      }));
    }),
    addPost: wrap((teamId, body) => {
      if (!isActive(teamId)) throw new Error('팀원만 글을 올릴 수 있습니다');
      const b = clean(body, 1000); if (!b) throw new Error('내용을 입력하세요');
      db.posts.push({ id: uid('p'), teamId, userId: me().id, name: myMem(teamId).profile.name, body: b, at: Date.now(), comments: [] });
      save(); return true;
    }),
    deletePost: wrap((teamId, postId) => {
      const p = db.posts.find((x) => x.id === postId && x.teamId === teamId);
      if (!p) throw new Error('없는 글입니다');
      if (!(isActive(teamId) && (p.userId === me().id || isAdmin(teamId)))) throw new Error('작성자나 관리자만 지울 수 있습니다');
      db.posts.splice(db.posts.indexOf(p), 1); save(); return true;
    }),
    addComment: wrap((teamId, postId, body) => {
      if (!isActive(teamId)) throw new Error('팀원만 댓글을 달 수 있습니다');
      const p = db.posts.find((x) => x.id === postId && x.teamId === teamId);
      if (!p) throw new Error('없는 글입니다');
      const b = clean(body, 500); if (!b) throw new Error('내용을 입력하세요');
      p.comments.push({ id: uid('c'), userId: me().id, name: myMem(teamId).profile.name, body: b, at: Date.now() });
      save(); return true;
    }),
    deleteComment: wrap((teamId, postId, commentId) => {
      const p = db.posts.find((x) => x.id === postId && x.teamId === teamId);
      const c = p && p.comments.find((x) => x.id === commentId);
      if (!c) throw new Error('없는 댓글입니다');
      if (!(isActive(teamId) && (c.userId === me().id || isAdmin(teamId)))) throw new Error('작성자나 관리자만 지울 수 있습니다');
      p.comments.splice(p.comments.indexOf(c), 1); save(); return true;
    }),

    /* ----- 경기 기록 (다른 팀도 볼 수 있음) ----- */
    listGames: wrap((teamId) => {
      team(teamId);
      return db.games.filter((g) => g.teamId === teamId).sort((a, b) => (b.date.localeCompare(a.date)) || (b.gameNo - a.gameNo));
    }),
    saveGame: wrap((teamId, g) => {
      if (!isActive(teamId)) throw new Error('팀원만 기록할 수 있습니다');
      const today = ymd(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || '')) throw new Error('날짜가 올바르지 않습니다');
      if (g.date !== today && !isAdmin(teamId)) throw new Error('회원은 경기 당일 기록만 저장할 수 있습니다. 지난 기록은 대표·관리자가 저장합니다');
      const no = Math.max(1, Math.min(99, parseInt(g.gameNo, 10) || 1));
      const scope = g.scope === 'team' ? 'team' : 'all';
      const who = myMem(teamId).profile.name, now = Date.now();
      const teams = (g.teams || []).slice(0, scope === 'team' ? 1 : 4).map((t, i) => ({
        name: clean(t.name, 12) || String.fromCharCode(65 + i), color: clean(t.color, 12) || '#8d8d8d',
        players: (t.players || []).map((p) => ({ key: clean(p.key, 40), name: clean(p.name, 20), guest: !!p.guest, position: POSITIONS.includes(p.position) ? p.position : '' })),
        recorder: who, at: now
      })).filter((t) => t.players.length);
      if (!teams.length) throw new Error('저장할 선수가 없습니다');
      let row = db.games.find((x) => x.teamId === teamId && x.date === g.date && x.gameNo === no);
      if (!row) { row = { id: uid('g'), teamId, date: g.date, gameNo: no, teams: [], stats: {} }; db.games.push(row); }
      if (scope === 'all') { row.teams = teams; row.stats = {}; }
      else { // 같은 팀 이름의 옛 기록만 지우고 새로 넣는다 (상대 팀 기록은 그대로)
        const old = row.teams.find((t) => t.name === teams[0].name);
        if (old) old.players.forEach((p) => { delete row.stats[p.key]; });
        row.teams = row.teams.filter((t) => t.name !== teams[0].name).concat(teams).sort((x, y) => x.name.localeCompare(y.name));
      }
      let count = 0;
      teams.forEach((t) => t.players.forEach((p) => {
        const src = (g.stats || {})[p.key] || {}, o = {};
        STAT_KEYS.forEach((k) => { o[k] = Math.max(0, Math.min(999, parseInt(src[k], 10) || 0)); });
        row.stats[p.key] = o; count++;
      }));
      Object.assign(row, { day: clean(g.day, 30), recorder: who, at: now });
      save();
      return { id: row.id, count };
    }),
    deleteGame: wrap((teamId, gameId) => {
      if (!isAdmin(teamId)) throw new Error('관리자만 지울 수 있습니다');
      db.games = db.games.filter((x) => !(x.id === gameId && x.teamId === teamId)); save(); return true;
    }),

    /* ----- 팀 배정 저장 (팀 편성 → 기록 입력에서 불러쓰기, 팀원만) ----- */
    saveLineup: wrap((teamId, d) => {
      if (!isActive(teamId)) throw new Error('팀원만 저장할 수 있습니다');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('날짜가 올바르지 않습니다');
      const teams = (d.teams || []).slice(0, 8).map((t, i) => ({
        label: clean(t.label, 12) || String.fromCharCode(65 + i), color: clean(t.color, 12),
        members: (t.members || []).map((m) => ({ key: clean(m.key, 40), name: clean(m.name, 20), position: POSITIONS.includes(m.position) ? m.position : '', guest: !!m.guest }))
      })).filter((t) => t.members.length);
      if (!teams.length) throw new Error('배정된 팀이 없습니다');
      db.lineups = db.lineups.filter((x) => !(x.teamId === teamId && x.date === d.date)); // 같은 날짜로 다시 저장하면 수정
      db.lineups.push({ teamId, date: d.date, dayId: clean(d.dayId, 40), day: clean(d.day, 30), teams, by: myMem(teamId).profile.name, at: Date.now() });
      save();
      return { count: teams.reduce((n, t) => n + t.members.length, 0) };
    }),
    // date 로 저장된 배정, 없으면 그 요일(dayId)로 가장 나중에 저장된 배정
    getLineup: wrap((teamId, q) => {
      if (!isActive(teamId)) throw new Error('팀원에게만 공개됩니다');
      const list = db.lineups.filter((x) => x.teamId === teamId);
      let hit = q && q.date ? list.find((x) => x.date === q.date) : null;
      if (!hit && q && q.dayId) hit = list.filter((x) => x.dayId === q.dayId).sort((x, y) => y.date.localeCompare(x.date))[0];
      return hit ? { date: hit.date, dayId: hit.dayId, day: hit.day, teams: hit.teams } : null;
    }),
    lineupDates: wrap((teamId) => (isActive(teamId) ? db.lineups.filter((x) => x.teamId === teamId).map((x) => [x.date, x.day]) : [])),

    /* ----- 영상 링크 ([날짜, 게임 번호, 주소]. 경기 기록처럼 다른 팀도 볼 수 있음) ----- */
    listVideos: wrap((teamId) => { team(teamId); return db.videos.filter((v) => v.teamId === teamId).map((v) => [v.date, v.game, v.url]); }),
    saveVideo: wrap((teamId, date, game, url) => {
      if (!isActive(teamId)) throw new Error('팀원만 등록할 수 있습니다');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('날짜가 올바르지 않습니다');
      const no = Math.max(0, Math.min(99, parseInt(game, 10) || 0));
      const u = clean(url, 300);
      if (u && !/^https?:\/\//i.test(u)) throw new Error('영상 주소를 확인해 주세요');
      db.videos = db.videos.filter((v) => !(v.teamId === teamId && v.date === date && v.game === no)); // 비워서 저장하면 삭제
      if (u) db.videos.push({ teamId, date, game: no, url: u });
      save();
      return true;
    }),

    /* ----- 체험 데이터 ----- */
    resetDemo: wrap(() => { db = seed(); save(); return true; })
  };

  function defaultChecks() { return [{ id: 'paid', label: '회비 납부' }, { id: 'registered', label: '선수등록' }]; } // 데이터를 처음 만들 때도 쓰므로 function 선언으로
  // 로고는 화면에서 작게 줄인 그림(data URL)만 받는다
  const cleanLogo = (v) => (typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 45000 ? v : ''); // 시트 한 칸(5만 자)에 들어가야 한다
  // 팀 색상: 주 색(상단 바·버튼) + 강조 색(아이콘·탭 밑줄). 없으면 null = 앱 기본 색
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const cleanTheme = (v) => (v && HEX.test(v.main) && HEX.test(v.accent) ? { main: v.main.toLowerCase(), accent: v.accent.toLowerCase() } : null);
  // 상단 바 로고: 크기(s·m·l·xl)·위치(right·left)·테두리·상단 바를 로고 배경색(bg)으로 칠할지. 없으면 null = 기본(보통·오른쪽·테두리)
  const cleanLogoStyle = (v) => (v && typeof v === 'object' ? {
    size: ['s', 'm', 'l', 'xl'].includes(v.size) ? v.size : 'm', pos: v.pos === 'left' ? 'left' : 'right',
    border: v.border !== false, blend: !!v.blend && HEX.test(v.bg), bg: HEX.test(v.bg) ? v.bg.toLowerCase() : ''
  } : null);
  function cleanProfile(p, owner) {
    p = p || {};
    return {
      name: clean(p.name, 20), number: clean(p.number, 3).replace(/[^0-9]/g, ''),
      position: POSITIONS.includes(p.position) ? p.position : '', birthYear: clean(p.birthYear, 4).replace(/[^0-9]/g, ''),
      memberType: '정회원', checks: {}
    };
  }
  function removeTeamData(teamId) {
    delete db.teams[teamId];
    db.memberships = db.memberships.filter((m) => m.teamId !== teamId);
    db.attendance = db.attendance.filter((a) => a.teamId !== teamId);
    db.posts = db.posts.filter((p) => p.teamId !== teamId);
    db.games = db.games.filter((g) => g.teamId !== teamId);
    db.lineups = db.lineups.filter((x) => x.teamId !== teamId);
    db.videos = db.videos.filter((x) => x.teamId !== teamId);
    Object.keys(db.prefs).forEach((k) => { if (db.prefs[k].primaryTeamId === teamId) delete db.prefs[k]; });
  }

  /* ---------- 체험용 예시 데이터 ---------- */
  function seed() {
    const d = { v: 1, session: null, users: {}, teams: {}, memberships: [], attendance: [], posts: [], games: [], lineups: [], videos: [], prefs: {} };
    let n = 0;
    const user = (nick) => { const u = { id: 'u_demo' + (++n), provider: 'kakao', nickname: nick, createdAt: Date.now() }; d.users[u.id] = u; return u; };
    const wk = weekKey();
    const today = ymd(new Date());
    const pos = ['가드', '가드', '포워드', '포워드', '센터'];
    const plans = [
      { name: '남산 바스켓', sido: '서울', area: '중구 남산체육관', intro: '수·금 저녁에 모이는 동네 농구팀입니다. 초보 환영!', days: [[3, '20:00', '남산체육관', '22:00'], [5, '20:00', '남산체육관', '22:00']], owner: '남산대표', kba: 'yes',
        people: ['김민준', '이서준', '박도윤', '최하준', '정지호', '강은우', '조유준', '윤시우', '장건우'], notice: '이번 주 금요일은 체육관 사정으로 21시에 시작합니다.\n회비는 매달 10일까지 부탁드립니다.' },
      { name: '한강 슈터스', sido: '서울', area: '마포구 망원체육관', intro: '토요일 오전 정기 모임. 3점 슛 좋아하는 분 모십니다.', days: [[6, '09:00', '망원체육관', '12:00']], owner: '한강대표',
        people: ['오현우', '서지환', '신준서', '권도현', '황민재', '안태윤', '송이준'], notice: '토요일 9시 정각 시작, 늦으면 다음 게임부터 들어갑니다.' },
      { name: '해운대 리바운드', sido: '부산', area: '해운대구 국민체육센터', intro: '화·목 저녁 운동, 연습 경기 상대 구합니다.', days: [[2, '19:30', '국민체육센터', '21:30'], [4, '19:30', '국민체육센터', '21:30']], owner: '해운대대표', kba: 'yes',
        people: ['문승우', '배지훈', '홍성민', '유재원', '전우진', '고민혁'], notice: '목요일 연습 경기 있습니다(상대: 수영 바스켓).' }
    ];
    plans.forEach((pl, ti) => {
      const t = { id: 't_demo' + (ti + 1), name: pl.name, sido: pl.sido, area: pl.area, intro: pl.intro, createdAt: Date.now(), notice: pl.notice, demo: true, kba: pl.kba || 'no', logo: '', checkItems: defaultChecks(),
        days: pl.days.map((x, i) => ({ id: 'd_demo' + ti + i, weekday: x[0], time: x[1], end: x[3] || '', place: x[2] })) };
      d.teams[t.id] = t;
      const ow = user(pl.owner);
      t.createdBy = ow.id;
      d.memberships.push({ teamId: t.id, userId: ow.id, role: 'owner', status: 'active', joinedAt: Date.now(), message: '', profile: { name: pl.owner.replace('대표', '') + ' 대표', number: '1', position: '가드', memberType: '정회원', checks: { paid: true, registered: true }, birthYear: '1988' } });
      const keys = [ow.id];
      pl.people.forEach((nm, i) => {
        const u = user(nm);
        keys.push(u.id);
        d.memberships.push({ teamId: t.id, userId: u.id, role: i === 0 ? 'admin' : 'member', status: 'active', joinedAt: Date.now(), message: '',
          profile: { name: nm, number: String(i * 3 + 4), position: pos[i % 5], memberType: i === pl.people.length - 1 ? '게스트' : (i === 4 ? '휴식회원' : '정회원'), checks: { paid: i % 3 !== 2, registered: i % 4 !== 3 }, birthYear: String(1985 + i) } });
        if (i < pl.people.length - 2) {
          d.attendance.push({ teamId: t.id, userId: u.id, week: wk, days: i % 4 === 3 ? ['none'] : t.days.filter((_, k) => (i + k) % 2 === 0 || t.days.length === 1).map((x) => x.id),
            comment: ['이번 주 꼭 갑니다!', '', '조금 늦을 수 있어요', '', '공 챙겨 갈게요', ''][i % 6], at: Date.now() - (10 - i) * 3600e3 });
        }
      });
      d.posts.push({ id: 'p_demo' + ti, teamId: t.id, userId: keys[1], name: pl.people[0], body: '새 유니폼 색깔 투표합니다. 검정 vs 흰색 댓글로 남겨 주세요!', at: Date.now() - 86400e3,
        comments: [{ id: 'c_demo' + ti, userId: keys[2], name: pl.people[1], body: '검정이요', at: Date.now() - 80000e3 }] });
      // 최근 4일 × 4게임 (날마다 팀을 새로 섞는다)
      const mk = (k, i) => ({ key: k, name: i === 0 ? pl.owner.replace('대표', '') + ' 대표' : pl.people[i - 1], guest: false });
      d.games = d.games.concat(demoGames(t.id, ti + 1, keys.map(mk), pl.people[0]));
    });
    d.today = today;
    return d;
  }
  /* 예시 경기 만들기. 선수마다 성향(공격 비중·3점·패스·리바운드·수비)을 정해 두고 그에 맞춰 기록을 뽑는다 */
  function demoGames(teamId, tag, players, recorder) {
    let a = (1000 + tag * 7919) >>> 0;
    const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = (x) => Math.max(0, Math.round(x));
    const prof = players.map(() => ({ use: 0.5 + r(), three: r(), acc: 0.32 + r() * 0.3, pass: r(), reb: r(), def: r(), care: r() }));
    const out = [];
    [22, 15, 8, 1].forEach((ago, di) => {
      const dt = new Date(); dt.setDate(dt.getDate() - ago);
      const order = players.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = order[i]; order[i] = order[j]; order[j] = x; }
      const half = Math.ceil(order.length / 2);
      const side = (list) => list.map((i) => ({ key: players[i].key, name: players[i].name, guest: false }));
      for (let no = 1; no <= 4; no++) {
        const stats = {};
        order.forEach((i) => {
          const p = prof[i];
          const s = { p2m: 0, p2a: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, bc: 0 };
          const shots = n(p.use * 4 * (0.6 + r() * 0.8));
          for (let k = 0; k < shots; k++) {
            if (r() < p.three * 0.7) { s.p3a++; if (r() < p.acc * 0.8) s.p3m++; }
            else { s.p2a++; if (r() < p.acc + 0.14) { s.p2m++; if (r() < 0.08) { s.bc++; s.fta++; if (r() < 0.65) s.ftm++; } } }
          }
          if (r() < 0.3 * p.use) for (let k = 0; k < 2; k++) { s.fta++; if (r() < 0.65) s.ftm++; }
          s.reb = n(p.reb * 4 * r() + 0.3); s.ast = n(p.pass * 3 * r()); s.stl = n(p.def * 1.6 * r()); s.blk = n(p.def * p.reb * 1.5 * r());
          s.tov = n((1.2 - p.care) * p.use * 1.5 * r()); s.pf = n(1.8 * r());
          stats[players[i].key] = s;
        });
        out.push({ id: 'g_demo' + tag + '_' + di + no, teamId, date: ymd(dt), gameNo: no,
          teams: [{ name: 'A', color: '#1a1a1a', players: side(order.slice(0, half)), recorder, at: dt.getTime() }, { name: 'B', color: '#f57c00', players: side(order.slice(half)), recorder, at: dt.getTime() }],
          stats, recorder, at: dt.getTime() });
      }
    });
    return out;
  }

  if (ENV) ENV.Api = Api; else window.Api = Api;
})();
