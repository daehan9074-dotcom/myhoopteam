/* =========================================================
 *  선수 기록 계산 (Stats) — 화면·저장과 무관한 순수 계산
 *  코모도 참석자 웹페이지의 '선수 기록 · 선수 지표 · 선수 평가'와 같은 계산식.
 *  입력은 Api.listGames() 가 주는 경기 목록 그대로.
 *  경기 한 판의 선수 기록: 아래 KEYS 13종 (~m = 성공, ~a = 시도, bc = 바스켓카운트)
 * ========================================================= */
(function () {
  'use strict';
  const KEYS = ['p2m', 'p2a', 'p3m', 'p3a', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'bc'];
  const IDX = {}; KEYS.forEach((k, i) => { IDX[k] = i; });
  const N = KEYS.length;
  const PT = N;            // 팀 합계·adv 배열에서 득점 칸
  const DAYS = 5;          // 선수마다 '본인이 참석한 최근 5일'
  const PER = 4;           // 평균은 '4게임 기준' (1게임 평균 × 4)

  /* 표에 보이는 열 순서 (파생 열 포함) */
  const VIEW = [
    { t: 'pts', code: 'PTS', ko: '득점' },
    { t: 's', k: 'p2m', code: '2PM', ko: '2점 성공' },
    { t: 's', k: 'p2a', code: '2PA', ko: '2점 시도' },
    { t: 'pct', m: 'p2m', a: 'p2a', code: '2P%', ko: '2점 성공률' },
    { t: 's', k: 'p3m', code: '3PM', ko: '3점 성공' },
    { t: 's', k: 'p3a', code: '3PA', ko: '3점 시도' },
    { t: 'pct', m: 'p3m', a: 'p3a', code: '3P%', ko: '3점 성공률' },
    { t: 's', k: 'bc', code: 'BC', ko: '바스켓 카운트' },
    { t: 's', k: 'ftm', code: 'FTM', ko: '자유투 성공' },
    { t: 's', k: 'fta', code: 'FTA', ko: '자유투 시도' },
    { t: 'pct', m: 'ftm', a: 'fta', code: 'FT%', ko: '자유투 성공률' },
    { t: 's', k: 'reb', code: 'REB', ko: '리바운드' },
    { t: 's', k: 'ast', code: 'AST', ko: '어시스트' },
    { t: 's', k: 'stl', code: 'STL', ko: '스틸' },
    { t: 's', k: 'blk', code: 'BLK', ko: '블록' },
    { t: 's', k: 'tov', code: 'TO', ko: '턴오버' },
    { t: 's', k: 'pf', code: 'PF', ko: '반칙' }
  ];
  const NEG = { tov: 1, pf: 1 };            // 많을수록 나쁜 항목
  const SKIP = { p2a: 1, p3a: 1, fta: 1 };  // 강조하지 않는 항목 (시도 개수)
  const isNeg = (c) => c.t === 's' && !!NEG[c.k];
  const highlightable = (c) => !(c.t === 's' && SKIP[c.k]);

  const zeros = (n) => new Array(n).fill(0);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  /* 저장된 기록 → [성공, 시도, ...] 배열 */
  function vec(s) { s = s || {}; return KEYS.map((k) => s[k] || 0); }
  const ptsOf = (v) => v[0] * 2 + v[2] * 3 + v[4];

  /* 경기 목록 → 선수 한 명·한 게임당 한 줄.
     tm = 우리 팀 합계, op = 상대 팀 합계 [스탯..., 득점] (한 게임 내내 뛴다고 보고 그 선수가 코트에 있을 때의 기록으로 쓴다) */
  function rows(games) {
    const out = [];
    (games || []).forEach((g) => {
      const tt = g.teams.map((team) => {
        const t = zeros(N + 1);
        team.players.forEach((p) => { const v = vec(g.stats[p.key]); for (let i = 0; i < N; i++) t[i] += v[i]; t[PT] += ptsOf(v); });
        return t;
      });
      g.teams.forEach((team, ti) => {
        const others = g.teams.map((x, i) => i).filter((i) => i !== ti && g.teams[i].players.length);
        const op = zeros(N + 1);
        others.forEach((i) => { for (let j = 0; j <= N; j++) op[j] += tt[i][j]; });
        const best = others.length ? Math.max.apply(null, others.map((i) => tt[i][PT])) : null;
        const my = tt[ti][PT];
        const o = best == null ? '' : (my > best ? 'W' : (my < best ? 'L' : 'D'));
        team.players.forEach((p) => {
          const v = vec(g.stats[p.key]);
          out.push({ date: g.date, day: g.day || '', no: g.gameNo, gid: g.id, team: team.name, color: team.color, key: p.key, name: p.name, guest: !!p.guest,
            s: v, pts: ptsOf(v), o, tm: tt[ti], op, hasOp: others.length > 0 });
        });
      });
    });
    return out;
  }

  /* 여러 줄 합산. adv 는 상대 기록이 있는 게임만 모은다 */
  function aggregate(rs) {
    const a = { games: 0, days: 0, pts: 0, totals: zeros(N), wins: 0, losses: 0, draws: 0,
      adv: { g: 0, me: zeros(N + 1), tm: zeros(N + 1), op: zeros(N + 1) } };
    const ds = {};
    rs.forEach((r) => {
      a.games++; ds[r.date] = 1; a.pts += r.pts;
      for (let i = 0; i < N; i++) a.totals[i] += r.s[i];
      if (r.o === 'W') a.wins++; else if (r.o === 'L') a.losses++; else if (r.o === 'D') a.draws++;
      if (r.hasOp) {
        const ad = a.adv; ad.g++;
        for (let i = 0; i < N; i++) ad.me[i] += r.s[i];
        ad.me[PT] += r.pts;
        for (let i = 0; i <= N; i++) { ad.tm[i] += r.tm[i]; ad.op[i] += r.op[i]; }
      }
    });
    a.days = Object.keys(ds).length;
    return a;
  }
  /* 그 선수가 뛴 날짜 중 최근 n일의 줄만 */
  function recent(rs, n) {
    const dates = [];
    rs.forEach((r) => { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
    const keep = {};
    dates.sort().reverse().slice(0, n).forEach((d) => { keep[d] = 1; });
    return rs.filter((r) => keep[r.date]);
  }
  /* 지난 일요일 (이번 주 월요일 전날) */
  function lastSunday() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 1);
    return ymd(d);
  }

  /* 선수 기록 목록. members 를 주면 지금 팀의 정회원만 (게스트·휴식회원·나간 사람 제외).
     prev = 지난 일요일까지의 기록으로 같은 방식 집계 (▲ 비교 · '좋아진 점'용) */
  function summary(games, members) {
    const mem = {}; (members || []).forEach((m) => { mem[m.userId] = m; });
    const by = {};
    rows(games).forEach((r) => { if (!r.guest) (by[r.key] || (by[r.key] = [])).push(r); });
    const prevTo = lastSunday();
    const list = [];
    Object.keys(by).forEach((k) => {
      const m = mem[k];
      if (members && (!m || m.memberType !== '정회원')) return;
      const rs = by[k];
      const a = aggregate(recent(rs, DAYS));
      a.key = k; a.name = m ? m.name : rs[0].name;
      const pr = rs.filter((r) => r.date <= prevTo);
      a.prev = pr.length ? aggregate(recent(pr, DAYS)) : null;
      list.push(a);
    });
    return list;
  }
  /* 선수 한 명의 게임별 기록 (최근 날짜부터) + 전체 합계 + 최근 5일 */
  function player(games, key) {
    const rs = rows(games).filter((r) => r.key === key)
      .sort((a, b) => b.date.localeCompare(a.date) || a.no - b.no);
    return { rows: rs, all: aggregate(rs), recent: aggregate(recent(rs, DAYS)) };
  }

  /* 날짜별 보기: 그 날 뛴 사람(게스트 포함)의 합계와, 게임·팀별 기록지 */
  function day(games, date) {
    const rs = rows(games).filter((r) => r.date === date);
    const by = {}, order = [];
    rs.forEach((r) => { if (!by[r.key]) { by[r.key] = []; order.push(r.key); } by[r.key].push(r); });
    const players = order.map((k) => { const a = aggregate(by[k]); a.key = k; a.name = by[k][0].name; a.guest = by[k][0].guest; return a; });
    const gm = {}, groups = [];
    rs.forEach((r) => {
      const k = r.no + '|' + r.team;
      if (!gm[k]) groups.push(gm[k] = { game: r.no, team: r.team, color: r.color, rows: [] });
      gm[k].rows.push({ key: r.key, name: r.name, guest: r.guest, totals: r.s, pts: r.pts });
    });
    groups.sort((x, y) => (x.game - y.game) || (x.team < y.team ? -1 : 1));
    return { date, day: rs.length ? rs[0].day : '', names: players.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ko')), players, groups };
  }
  /* 기록이 있는 날짜 (오름차순) */
  function dates(games) {
    const d = {}; (games || []).forEach((g) => { d[g.date] = 1; });
    return Object.keys(d).sort();
  }
  /* 한 줄의 열별 원시값 (강조 비교용) */
  function rawVal(totals, pts, c) {
    if (c.t === 'pts') return pts;
    if (c.t === 'pct') { const a = totals[IDX[c.a]]; return a > 0 ? totals[IDX[c.m]] / a : -1; }
    return totals[IDX[c.k]];
  }
  /* 한 팀 안에서 열별 최고값 (시도 개수는 제외) */
  function teamMaxes(list) {
    return VIEW.map((c) => {
      if (!highlightable(c)) return null;
      const v = list.map((x) => rawVal(x.totals, x.pts, c)).filter((x) => x > 0);
      return v.length ? Math.max.apply(null, v) : null;
    });
  }

  /* ---------- 표 값 ---------- */
  /* 표에 표시되는 '4게임 기준 평균' (= 합계 ÷ 게임 수 × 4). 성공률은 합계 기준 */
  function colVal(p, c) {
    const g = (p.games || 1) / PER;
    if (c.t === 'pts') return p.pts / g;
    if (c.t === 'pct') { const a = p.totals[IDX[c.a]]; return a > 0 ? p.totals[IDX[c.m]] / a : -1; }
    return p.totals[IDX[c.k]] / g;
  }
  /* 상위 10% 경계값 (동점이면 함께 포함) */
  function topN(vals) {
    const v = vals.filter((x) => x > 0).sort((a, b) => b - a);
    if (!v.length) return null;
    return v[Math.max(1, Math.ceil(v.length * 0.1)) - 1];
  }
  const thresholds = (list) => VIEW.map((c) => (highlightable(c) ? topN(list.map((p) => colVal(p, c))) : null));
  function winRate(p) {
    const n = (p.wins || 0) + (p.losses || 0) + (p.draws || 0);
    return n > 0 ? (p.wins || 0) / n : -1;
  }
  function winLabel(p) {
    const w = p.wins || 0, l = p.losses || 0, d = p.draws || 0;
    return d > 0 ? (w + '-' + l + '-' + d) : (w + '-' + l);
  }
  /* 지난주 대비: 화면에 보이는 숫자(반올림 값)로 비교. 일반 항목은 오르면 'up', 턴오버·반칙은 줄면 'down' */
  function shown(p, c) {
    const v = colVal(p, c);
    if (c.t === 'pct') return v < 0 ? null : Math.round(v * 100);
    return Math.round(v * 10);
  }
  function trend(p, c) {
    if (!p.prev || !p.prev.games || !highlightable(c)) return '';
    const now = shown(p, c), before = shown(p.prev, c);
    if (now == null || before == null) return '';
    if (isNeg(c)) return now < before ? 'down' : '';
    return now > before ? 'up' : '';
  }

  /* =========================================================
   *  선수 지표 (한 게임 내내 뛴다고 가정)
   *  adv = { g: 상대 기록이 있는 게임 수, me/tm/op: [스탯..., 득점] }
   * ========================================================= */
  const fga = (x) => x[IDX.p2a] + x[IDX.p3a];
  const fgm = (x) => x[IDX.p2m] + x[IDX.p3m];
  /* 공격 횟수 = 야투 시도 + 0.44×자유투 시도 + 턴오버 (공격 리바운드 구분이 없어 빼지 않는다) */
  const poss = (x) => fga(x) + 0.44 * x[IDX.fta] + x[IDX.tov];
  const div = (a, b) => (b > 0 ? a / b : null);
  const x100 = (v) => (v == null ? null : v * 100);
  /* low:true = 낮을수록 좋은 지표 */
  const AV_COLS = [
    { k: 'ts', code: 'TS%', ko: '슈팅 효율', grp: '공격', u: '%',
      f: (p) => x100(div(p.pts, 2 * (fga(p.totals) + 0.44 * p.totals[IDX.fta]))),
      calc: '득점 ÷ (2 × (야투 시도 + 0.44 × 자유투 시도))',
      mean: '2점·3점·자유투를 모두 합친 득점 효율. 3점과 자유투의 가치까지 반영한 성공률입니다.',
      ref: '50% 보통 · 55% 이상 좋음' },
    { k: 'usg', code: 'USG%', ko: '공격 점유율', grp: '공격', u: '%',
      f: (p) => x100(div(poss(p.adv.me), poss(p.adv.tm))),
      calc: '내 공격 횟수 ÷ 우리 팀 공격 횟수<br><small>공격 횟수 = 야투 시도 + 0.44 × 자유투 시도 + 턴오버</small>',
      mean: '팀 공격이 내 손에서 끝난 비율. 높을수록 공격을 많이 맡은 선수입니다. (잘하고 못하고가 아니라 역할)',
      ref: '5명이면 평균 20%' },
    { k: 'astp', code: 'AST%', ko: '어시스트율', grp: '공격', u: '%',
      f: (p) => x100(div(p.adv.me[IDX.ast], fgm(p.adv.tm) - fgm(p.adv.me))),
      calc: '내 어시스트 ÷ (팀 야투 성공 − 내 야투 성공)',
      mean: '내가 코트에 있을 때 동료가 넣은 슛 중 내 패스로 만든 비율.',
      ref: '20% 이상이면 패스로 공격을 만드는 선수' },
    { k: 'drtg', code: 'DRtg', ko: '수비 효율', grp: '수비', u: '', low: true,
      f: (p) => x100(div(p.adv.op[PT], poss(p.adv.op))),
      calc: '상대 득점 ÷ 상대 공격 횟수 × 100',
      mean: '내가 뛴 게임에서 상대가 공격 100번에 낸 점수. <b>낮을수록 좋습니다.</b> 팀 수비 결과라 같은 팀 선수는 같은 값이지만, 팀이 매번 바뀌므로 여러 날 쌓이면 선수마다 차이가 납니다.',
      ref: '전체 평균보다 낮으면 좋음' },
    { k: 'stk', code: 'STK%', ko: '스틸+블록 비율', grp: '수비', u: '%',
      f: (p) => x100(div(p.adv.me[IDX.stl] + p.adv.me[IDX.blk], poss(p.adv.op))),
      calc: '(스틸 + 블록) ÷ 상대 공격 횟수',
      mean: '상대 공격 100번 중 내가 직접 끊거나 막은 비율. 기록지로 볼 수 있는 개인 수비 지표입니다.',
      ref: '높을수록 좋음' },
    { k: 'rebp', code: 'REB%', ko: '리바운드 점유율', grp: '수비', u: '%',
      f: (p) => x100(div(p.adv.me[IDX.reb], p.adv.tm[IDX.reb] + p.adv.op[IDX.reb])),
      calc: '내 리바운드 ÷ (우리 팀 + 상대 팀 리바운드)',
      mean: '그 게임에서 나온 리바운드 전체 중 내가 잡은 몫. 팀마다 리바운드 기록 수가 달라도 공평하게 비교됩니다.',
      ref: '10명이면 평균 10%' },
    { k: 'net', code: 'NET', ko: '효율 차이', grp: '종합', u: '', sign: true,
      f: (p) => { const a = p.adv, o = div(a.tm[PT], poss(a.tm)), d = div(a.op[PT], poss(a.op)); return (o == null || d == null) ? null : (o - d) * 100; },
      calc: '우리 팀 공격 효율 − 상대 공격 효율<br><small>(득점 ÷ 공격 횟수 × 100)</small>',
      mean: '내가 뛴 게임에서 우리 팀이 공격 100번당 몇 점 더 냈는지. 득실 마진을 공격 횟수로 맞춘 값이라 승패와 가장 가깝습니다.',
      ref: '+ 면 이기는 쪽, − 면 지는 쪽' }
  ];
  function avVal(p, c) {
    if (c.k !== 'ts' && !(p.adv && p.adv.g)) return null;
    const v = c.f(p);
    return (v == null || !isFinite(v)) ? null : v;
  }
  function avTxt(v, c) {
    if (v == null) return '-';
    return (c.sign && v > 0 ? '+' : '') + v.toFixed(1) + (c.u || '');
  }
  /* 상위 10% 경계 (low 지표는 낮은 쪽, 음수도 허용) */
  function avTop(vals, low) {
    const v = vals.filter((x) => x != null).sort((a, b) => (low ? a - b : b - a));
    if (v.length < 2) return null;
    return v[Math.max(1, Math.ceil(v.length * 0.1)) - 1];
  }

  /* =========================================================
   *  선수 개인 평가 (규칙 기반)
   *  선수 기록 표와 같은 기준(본인이 참석한 최근 5일)으로 다른 선수들과 비교해 만든다.
   *  '좋아진 점'은 지난 일요일까지의 기록(prev)과 비교.
   * ========================================================= */
  const EVAL_MIN_GAMES = 10;   // 이보다 적으면 '데이터가 적습니다'
  const EVAL_3P_OK = 33;       // 3점 성공률이 이 이상이면 '정확한 슈터'로 본다 (%)

  /* 선수 한 명의 지표 (4게임 기준 개수 + 비율 지표) */
  function evalMetrics(p) {
    const t = p.totals, g = p.games || 1, a = p.adv;
    const m = {
      g: p.games,
      wr: x100(div(p.wins, p.wins + p.losses + p.draws)),
      pts: p.pts / g * PER, reb: t[IDX.reb] / g * PER, ast: t[IDX.ast] / g * PER, tov: t[IDX.tov] / g * PER,
      ts: x100(div(p.pts, 2 * (fga(t) + 0.44 * t[IDX.fta]))),
      p3r: x100(div(t[IDX.p3a], fga(t))),
      p3p: t[IDX.p3a] >= 10 ? t[IDX.p3m] / t[IDX.p3a] * 100 : null,   // 3점 성공률 (10개 이상 던진 선수만)
      ato: t[IDX.tov] > 0 ? t[IDX.ast] / t[IDX.tov] : (t[IDX.ast] > 0 ? t[IDX.ast] : null)
    };
    if (a && a.g) {
      m.usg = x100(div(poss(a.me), poss(a.tm)));
      m.astp = x100(div(a.me[IDX.ast], fgm(a.tm) - fgm(a.me)));
      m.rebp = x100(div(a.me[IDX.reb], a.tm[IDX.reb] + a.op[IDX.reb]));
      m.stkp = x100(div(a.me[IDX.stl] + a.me[IDX.blk], poss(a.op)));
      const o = div(a.tm[PT], poss(a.tm)), d = div(a.op[PT], poss(a.op));
      m.drtg = d == null ? null : d * 100;
      m.net = (o == null || d == null) ? null : (o - d) * 100;
    }
    return m;
  }
  /* good/bad = 목록에 쓰는 짧은 문구, gl = 한줄평용 강점 문장, bl = 한줄평용 과제('~것'). low = 낮을수록 좋음 */
  const EVAL_DEF = {
    pts: { good: '득점력이 좋음 (4게임당 {v}점)', gl: '득점력이 강점입니다', bad: null },
    p3p: { good: '3점이 정확함 (3P {v}%)', gl: '정확한 3점이 강점입니다', bad: '3점 성공률이 낮음 (3P {v}%)', bl: '3점 성공률을 높이는 것' },
    ts: { good: '슛 효율이 높음 (TS {v}%)', gl: '슛 효율이 강점입니다', bad: '슛 효율이 낮음 (TS {v}%)', bl: '슛 효율을 높이는 것' },
    astp: { good: '패스로 동료 득점을 잘 만듦 (AST% {v})', gl: '동료를 살리는 패스가 강점입니다', bad: '패스로 만드는 득점이 적음 (AST% {v})', bl: '패스로 동료 득점을 만드는 것' },
    ato: { good: '실책 대비 어시스트가 좋음 (AST/TO {v})', gl: '실수 없는 볼 처리가 강점입니다', bad: null },
    rebp: { good: '리바운드를 많이 잡음 (REB% {v})', gl: '리바운드가 강점입니다', bad: '리바운드 참여가 적음 (REB% {v})', bl: '리바운드 참여를 늘리는 것' },
    stkp: { good: '스틸·블록으로 상대 공격을 자주 끊음 (STK% {v})', gl: '스틸·블록으로 공격을 끊는 수비가 강점입니다', bad: null },
    tov: { good: '실책이 적음 (4게임당 {v}개)', gl: '실책이 적은 안정감이 강점입니다', bad: '실책이 많음 (4게임당 {v}개)', bl: '실책을 줄이는 것', low: true },
    drtg: { good: '뛸 때 팀 실점이 적음 (DRtg {v})', gl: '뛸 때 팀 수비가 단단해지는 것이 강점입니다', bad: '뛸 때 팀 실점이 많음 (DRtg {v})', bl: '뛸 때 팀 실점을 줄이는 것', low: true },
    net: { good: '뛸 때 팀이 크게 앞섬 (NET {v})', gl: '뛸 때 팀이 크게 앞서는 것이 강점입니다', bad: '뛸 때 팀이 밀림 (NET {v})', bl: '뛸 때 밀리는 흐름을 바꾸는 것' }
  };
  function evalFmt(k, v) {
    const s = (Math.round(v * 10) / 10).toFixed(1);
    return (k === 'net' && v > 0) ? '+' + s : s;
  }
  /* 값들 중 v 가 몇 % 위치인지 (0=최하, 1=최상). low 지표는 뒤집는다 */
  function evalRank(vals, v, low) {
    const xs = vals.filter((x) => x != null);
    if (v == null || xs.length < 2) return null;
    let below = 0, same = 0;
    xs.forEach((x) => { if (x < v) below++; else if (x === v) same++; });
    const r = (below + (same - 1) / 2) / (xs.length - 1);
    return low ? 1 - r : r;
  }
  /* summary() 결과 → { 선수 key: 평가 } */
  function evals(list) {
    const ps = (list || []).filter((p) => p.games > 0);
    const ms = ps.map(evalMetrics);
    const keys = ['pts', 'ts', 'usg', 'astp', 'ato', 'rebp', 'stkp', 'tov', 'drtg', 'net', 'p3r', 'p3p', 'wr'];
    const col = {};
    keys.forEach((k) => { col[k] = ms.map((m) => m[k]); });
    const today = ymd(new Date());
    const out = {};
    ps.forEach((p, i) => {
      const m = ms[i];
      const rk = {};
      keys.forEach((k) => { rk[k] = evalRank(col[k], m[k], EVAL_DEF[k] && EVAL_DEF[k].low); });
      const hi = (k) => rk[k] != null && rk[k] >= 0.75;
      const lo = (k) => rk[k] != null && rk[k] <= 0.25;

      // 1) 유형
      let type;
      if (hi('usg') && hi('astp')) type = '볼 핸들러형 득점원';
      else if (hi('usg')) type = '주득점원';
      else if (hi('astp')) type = '플레이메이커';
      else if (hi('rebp') && (m.p3r || 0) < 20) type = '골밑·리바운드형';
      // 3점을 많이 던져도 정확하지 않으면 '슈터'라고 하지 않는다
      else if ((m.p3r || 0) >= 50) type = (m.p3p != null && m.p3p < EVAL_3P_OK) ? '외곽 슛 위주형' : '외곽 슈터형';
      // 공격 비중이 낮다는 뜻일 뿐이므로 '궂은일'이라고 단정하지 않는다
      else if (lo('usg')) type = '보조 역할형';
      else type = '균형형';
      if (type !== '골밑·리바운드형' && hi('rebp')) type += ' + 리바운드';

      // 2) 강점·보완점 (상위·하위 25%, 많이 벗어난 순으로 3개까지)
      const good = [], bad = [];
      Object.keys(EVAL_DEF).forEach((k) => {
        const d = EVAL_DEF[k];
        if (k === 'p3p' && hi(k) && m[k] < EVAL_3P_OK) return;   // 순위만 높고 실제로는 부정확하면 강점으로 안 씀
        if (hi(k) && d.good && !(k === 'net' && m[k] <= 0)) good.push({ r: rk[k], k, t: d.good.replace('{v}', evalFmt(k, m[k])) });
        if (lo(k) && d.bad) {
          // 공격을 거의 맡지 않는 선수에게는 슛 효율·어시스트 부족을 약점으로 보지 않는다
          if ((k === 'ts' || k === 'astp') && lo('usg')) return;
          if (k === 'net' && m[k] >= 0) return;   // 앞서고 있는데 '밀림'이라 하지 않는다
          bad.push({ r: rk[k], k, t: d.bad.replace('{v}', evalFmt(k, m[k])) });
        }
      });
      // 실책이 많은 선수에게 '실책 대비 어시스트가 좋음'을 강점으로 같이 쓰면 헷갈리므로 뺀다
      if (bad.some((x) => x.k === 'tov')) for (let j = good.length - 1; j >= 0; j--) if (good[j].k === 'ato') good.splice(j, 1);
      good.sort((a, b) => b.r - a.r);
      bad.sort((a, b) => a.r - b.r);

      // 3) 한줄평
      let line;
      const below = (k) => rk[k] != null && rk[k] < 0.5;
      // 공격을 많이 맡는데 슛 효율이 평균 아래면 한줄평에서 지적하므로, 보완점 목록에도 맨 앞에 넣어 맞춘다
      const lowEff = hi('usg') && below('ts');
      if (lowEff && !bad.some((x) => x.k === 'ts')) bad.unshift({ r: -1, k: 'ts', t: EVAL_DEF.ts.bad.replace('{v}', evalFmt('ts', m.ts)) });
      // '눈에 띄는 약점은 없습니다'는 평균보다 꽤 낮은(하위 40%) 항목이 하나도 없을 때만 쓴다
      const weakish = Object.keys(EVAL_DEF).some((k) => {
        if (!EVAL_DEF[k].bad || rk[k] == null || rk[k] >= 0.4) return false;
        if ((k === 'ts' || k === 'astp') && lo('usg')) return false;
        if (k === 'net' && m[k] >= 0) return false;
        return true;
      });
      if (hi('usg') && hi('ts')) line = '공격을 많이 맡으면서 효율도 좋은 팀의 핵심 공격수입니다.';
      else if (lowEff) line = '공격 비중에 비해 슛 효율이 낮습니다. ' +
        ((m.p3r || 0) >= 40 && !(m.p3p != null && m.p3p >= EVAL_3P_OK)
          ? '야투의 ' + Math.round(m.p3r) + '%가 3점이라, 골밑·중거리 비중을 늘리면 효율이 오를 수 있습니다.'
          : '좋은 자리에서 던지는 슛 비중을 늘려 보세요.');
      else if (lo('usg') && hi('net')) line = '공격을 많이 맡지 않지만, 뛸 때 팀 결과가 좋은 역할 선수입니다.';
      else if (hi('rebp') && hi('drtg')) line = '리바운드와 수비로 팀을 받쳐 주는 선수입니다.';
      else if (hi('astp') && hi('ato') && !lo('tov')) line = '실수 없이 동료를 살려 주는 패스가 강점입니다.';
      // 어시스트는 많지만 실책 개수도 많으면 '실수 없이'라고 하지 않는다 (보완점과 모순)
      else if (hi('astp') && lo('tov')) line = '동료를 살리는 패스가 강점입니다. 실책을 줄이는 것이 다음 과제입니다.';
      else if (good.length && !bad.length) line = EVAL_DEF[good[0].k].gl + (weakish ? '.' : '. 눈에 띄는 약점은 없습니다.');
      else if (good.length) line = EVAL_DEF[good[0].k].gl + '. ' + EVAL_DEF[bad[0].k].bl + '이 다음 과제입니다.';
      else if (bad.length) line = EVAL_DEF[bad[0].k].bl + '이 다음 과제입니다. 이 부분을 채우면 팀 기여가 커집니다.';
      else line = '모든 지표가 평균 가까이에 있는 균형 잡힌 선수입니다.';
      if (m.g < EVAL_MIN_GAMES) line = '(데이터가 적습니다) ' + line;

      // 4) 지난주보다 좋아진 점
      const up = [];
      const pm = p.prev && p.prev.games ? evalMetrics(p.prev) : null;
      if (pm) {
        const TH = { ts: 3, astp: 3, rebp: 2, stkp: 0.5, drtg: -3, net: 3, tov: -0.5, pts: 2 };
        const NM = { ts: '슛 효율', astp: '어시스트율', rebp: '리바운드 점유율', stkp: '스틸·블록', drtg: '팀 실점', net: '효율 차이', tov: '실책', pts: '득점' };
        Object.keys(TH).forEach((k) => {
          if (m[k] == null || pm[k] == null) return;
          const dlt = m[k] - pm[k];
          if ((TH[k] > 0 && dlt >= TH[k]) || (TH[k] < 0 && dlt <= TH[k])) up.push(NM[k] + ' ' + evalFmt(k, pm[k]) + ' → ' + evalFmt(k, m[k]));
        });
      }
      out[p.key] = { date: today, games: m.g, type, line,
        good: good.slice(0, 3).map((x) => x.t), bad: bad.slice(0, 3).map((x) => x.t), up };
    });
    return out;
  }

  /* =========================================================
   *  실력 점수 (팀 편성 '실력 균형 배정'용)
   *  실력 점수 = 효율 50% + 승률 25% + 수비 25% (50 이 전체 평균, 10 이 표준편차)
   *  효율 = 1게임 평균 (득점 + 리바운드 + 어시스트 + 스틸 + 블록 − 놓친 야투 − 놓친 자유투 − 턴오버)
   *  수비 = 스틸+블록 비율(STK%) 과 수비 효율(DRtg, 낮을수록 좋음) 의 평균
   *  게임 수가 적은 선수는 전체 평균 쪽으로 당겨 쓴다(3게임 가중).
   *  summary() 결과 → { map: {선수 key: 점수}, mean, std }
   * ========================================================= */
  const SKILL_K = 3;
  function skillMap(list) {
    const ps = (list || []).filter((p) => p && p.games && p.totals);
    const map = {};
    if (!ps.length) return { map, mean: 50, std: 10 };
    const z = (vals) => {
      const v = vals.filter((x) => x != null);
      if (v.length < 2) return vals.map(() => 0);
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) || 1;
      return vals.map((x) => (x == null ? 0 : (x - m) / sd));
    };
    const col = (k) => AV_COLS.find((c) => c.k === k);
    const zE = z(ps.map((p) => {
      const t = p.totals;
      const miss = (t[IDX.p2a] - t[IDX.p2m]) + (t[IDX.p3a] - t[IDX.p3m]) + (t[IDX.fta] - t[IDX.ftm]);
      return ((p.pts || 0) + t[IDX.reb] + t[IDX.ast] + t[IDX.stl] + t[IDX.blk] - miss - t[IDX.tov]) / p.games;
    }));
    // 승률은 경기 수가 적으면 5할 쪽으로 당긴다
    const zW = z(ps.map((p) => {
      const n = (p.wins || 0) + (p.losses || 0) + (p.draws || 0);
      return n > 0 ? ((p.wins || 0) + 0.5 * (p.draws || 0) + 0.5 * SKILL_K) / (n + SKILL_K) : null;
    }));
    const zS = z(ps.map((p) => avVal(p, col('stk'))));
    const zD = z(ps.map((p) => { const v = avVal(p, col('drtg')); return v == null ? null : -v; }));
    ps.forEach((p, i) => {
      const c = 0.5 * zE[i] + 0.25 * zW[i] + 0.25 * (zS[i] + zD[i]) / 2;
      map[p.key] = 50 + 10 * c * p.games / (p.games + SKILL_K);
    });
    const vals = Object.values(map);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length);
    return { map, mean, std: sd > 1e-9 ? sd : 1 };
  }

  window.Stats = { skillMap, day, dates, rawVal, teamMaxes, vec, KEYS, IDX, VIEW, DAYS, PER, isNeg, highlightable, summary, player, colVal, topN, thresholds, winRate, winLabel, trend,
    AV_COLS, avVal, avTxt, avTop, evals };
})();
