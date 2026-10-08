'use strict';
/**
 * IMC BOAT RACING - Engine luật chơi.
 * Không phụ thuộc express/socket.io nên có thể chạy mô phỏng bằng `npm test`.
 * server.js chỉ làm nhiệm vụ nối mạng và gọi các hàm của lớp Game.
 */
const { DEFAULT_QUESTIONS_TEXT, DEFAULT_KING_TEXT } = require('./questions');

const ROLES = ['p1', 'p2', 'p3', 'p4', 'navigator'];
const PADDLERS = ['p1', 'p2', 'p3', 'p4'];
const ROLE_NAMES = { p1: 'Người Chèo 1', p2: 'Người Chèo 2', p3: 'Người Chèo 3', p4: 'Người Chèo 4', navigator: 'Hoa Tiêu' };

const CFG = {
  MAX_TEAMS: 50,
  ENERGY_PER_SEGMENT: 4,        // 4 năng lượng = 1 đoạn đường
  GOLD_PER_ENERGY: 10,          // mỗi năng lượng = +10 vàng (chuyển cho Hoa Tiêu)
  BLOCK_MS: [3000, 5000],       // trả lời sai: bị chặn 3-5 giây
  FREEZE_MS: 3000,
  BOOST_MS: 2000,
  WIND_MS: 5000,
  ANCHOR_MS: 4000,
  BOOST_SPEED: 0.6,             // Tốc Biến: thêm 0.6 đoạn/giây trong 2 giây
  WIND_MULT: 1.25,              // Gió Thuận: +25% tốc độ
  ANCHOR_MULT: 0.5,             // Mỏ Neo: -50% tốc độ
  EARLY_AT: 0.5,                // sau 50% thời gian...
  EARLY_LEAD_PCT: 25,           // ...nếu dẫn >= 25% đường đua
  EARLY_COUNTDOWN_MS: 15000,
  KING_AT: 0.85,                // 15% thời gian cuối
  KING_QUESTION_MS: 45000,      // thời gian cho mỗi câu Thuyền Vương
  KING_WIN_MS: 4000,            // thời gian "lao về đích" trước khi kết thúc
};

const ITEMS = {
  freeze:  { name: 'Băng Sương',     icon: '❄️', cost: 50, kind: 'attack', desc: 'Đóng băng thuyền đối thủ 3 giây' },
  unlock:  { name: 'Mở Trói',        icon: '🔓', cost: 40, kind: 'self',   desc: 'Phá băng cho thuyền mình' },
  boost:   { name: 'Tốc Biến',       icon: '⚡', cost: 60, kind: 'self',   desc: 'Tăng tốc trong 2 giây' },
  shield:  { name: 'Khiên Hộ Mệnh',  icon: '🛡️', cost: 50, kind: 'self',   desc: 'Chặn 1 lần tấn công' },
  mystery: { name: 'Hòm Bí Ẩn',      icon: '🎲', cost: 40, kind: 'random', desc: 'Nhận vật phẩm ngẫu nhiên' },
  wind:    { name: 'Gió Thuận',      icon: '🌪️', cost: 70, kind: 'self',   desc: '+25% tốc độ trong 5 giây' },
  anchor:  { name: 'Mỏ Neo',         icon: '⚓', cost: 70, kind: 'attack', desc: 'Giảm 50% tốc độ đối thủ 4 giây' },
};
const RANDOM_POOL = ['freeze', 'unlock', 'boost', 'shield', 'wind', 'anchor'];

const roomOf = (teamId, role) => `p:${teamId}:${role}`;

// ---------------------------------------------------------------- tiện ích
function colorFor(i) {
  const h = (i * 137.508) % 360, s = 0.72, l = 0.58;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return '#' + hex(f(0)) + hex(f(8)) + hex(f(4));
}

/** Phân tích danh sách câu hỏi từ văn bản. */
function parseQuestions(text, withLevel) {
  const list = [], errors = [];
  const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  for (const line of lines) {
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 2) { errors.push(`Bỏ qua dòng thiếu dấu "|": "${line.slice(0, 40)}"`); continue; }
    let level = null;
    if (withLevel && parts.length >= 3 && /^[123]$/.test(parts[parts.length - 1])) level = Number(parts.pop());
    const a = parts.pop();
    const q = parts.join(' | ');
    if (!q || a === '') { errors.push(`Bỏ qua dòng thiếu nội dung: "${line.slice(0, 40)}"`); continue; }
    list.push({ q, a, level });
  }
  const n = list.length;
  list.forEach((x, i) => {
    if (withLevel && !x.level) x.level = Math.min(3, 1 + Math.floor((i * 3) / n));
    x.id = (withLevel ? 'q' : 'k') + i;
  });
  return { list, errors };
}

function toNumber(s) {
  s = String(s).trim().replace(/\s+/g, '').replace(',', '.');
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
  return NaN;
}
function sameAnswer(input, expected) {
  const a = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  const b = String(expected).trim().toLowerCase().replace(/\s+/g, ' ');
  if (a === b) return true;
  const na = toNumber(a), nb = toNumber(b);
  if (!isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) < 1e-9;
  return a.replace(/\s/g, '') === b.replace(/\s/g, '');
}

function newPlayer() { return { sid: null, q: null, seen: new Set(), blockedUntil: 0, correct: 0, wrong: 0 }; }
function newTeam(id, name, color) {
  const players = {};
  ROLES.forEach((r) => { players[r] = newPlayer(); });
  return { id, name, color, pos: 0, energy: 0, gold: 0, frozenUntil: 0, boostUntil: 0, windUntil: 0, anchorUntil: 0, shield: false, dash: false, players };
}

function defaultSettings() {
  return { teamCount: 4, minutes: 10, track: 40, teamNames: '', questionsText: DEFAULT_QUESTIONS_TEXT, kingText: DEFAULT_KING_TEXT };
}

// ---------------------------------------------------------------- GAME
class Game {
  /** opts.emit(event, payload, room?) - room rỗng = gửi cho tất cả. */
  constructor(opts = {}) {
    this.emit = opts.emit || (() => {});
    this.now = opts.now || Date.now;
    this.rng = opts.rng || Math.random;
    this.phase = 'lobby'; // lobby | running | king | finished
    this.teams = [];
    this.settings = null;
    this.lastTick = this.now();
    const r = this.configure(opts.settings || defaultSettings());
    if (!r.ok) throw new Error(r.error);
  }

  get track() { return this.settings.track; }

  // ------------------------------------------------------------ cấu hình
  configure(input) {
    if (this.phase === 'running' || this.phase === 'king') {
      return { ok: false, error: 'Đang có trận đấu. Hãy bấm "Làm lại" trước khi đổi cấu hình.' };
    }
    const s = {
      teamCount: parseInt(input.teamCount, 10),
      minutes: Number(input.minutes),
      track: parseInt(input.track, 10),
      teamNames: String(input.teamNames || ''),
      questionsText: String(input.questionsText || ''),
      kingText: String(input.kingText || ''),
    };
    if (!(s.teamCount >= 1 && s.teamCount <= CFG.MAX_TEAMS)) return { ok: false, error: `Số đội phải từ 1 đến ${CFG.MAX_TEAMS}` };
    if (!(s.minutes >= 0.1 && s.minutes <= 180)) return { ok: false, error: 'Thời gian trận đấu phải từ 0.1 đến 180 phút' };
    if (!(s.track >= 5 && s.track <= 300)) return { ok: false, error: 'Số đoạn đường phải từ 5 đến 300' };
    const q = parseQuestions(s.questionsText, true);
    if (!q.list.length) return { ok: false, error: 'Cần ít nhất 1 câu hỏi. Định dạng: Câu hỏi | Đáp án | Độ khó' };
    const k = parseQuestions(s.kingText, false);
    this.settings = s;
    this.questions = q.list;
    this.kingQuestions = k.list;
    this.phase = 'lobby';
    const dropped = this._rebuild();
    return { ok: true, settings: s, counts: { questions: q.list.length, king: k.list.length }, warnings: [...q.errors, ...k.errors], dropped };
  }

  /** Tạo lại đội, giữ nguyên các thiết bị đã kết nối nếu đội/vai trò vẫn tồn tại. */
  _rebuild() {
    const old = [];
    for (const t of this.teams) for (const r of ROLES) if (t.players[r].sid) old.push({ sid: t.players[r].sid, team: t.id, role: r });
    const names = this.settings.teamNames.split(/\r?\n/).map((s) => s.trim());
    this.teams = Array.from({ length: this.settings.teamCount }, (_, i) => newTeam(i + 1, names[i] || `Đội ${i + 1}`, colorFor(i)));
    const dropped = [];
    for (const o of old) {
      const t = this.teams[o.team - 1];
      if (t) t.players[o.role].sid = o.sid; else dropped.push(o.sid);
    }
    this.startAt = 0; this.endAt = 0; this.earlyAt = 0;
    this.king = null; this.kingDone = false; this.kingIndex = 0; this.result = null;
    return dropped;
  }

  reset() {
    this.phase = 'lobby';
    const dropped = this._rebuild();
    this.emit('lobby', {});
    return { ok: true, dropped };
  }

  // ------------------------------------------------------------ kết nối
  attach(teamId, role, sid) {
    const t = this.teams[Number(teamId) - 1];
    if (!t || !ROLES.includes(role)) return { ok: false, error: 'Mã QR không hợp lệ: đội hoặc vai trò không tồn tại (admin có thể đã đổi số đội).' };
    const p = t.players[role];
    const replaced = p.sid && p.sid !== sid ? p.sid : null;
    p.sid = sid;
    return { ok: true, replaced, blockMs: Math.max(0, p.blockedUntil - this.now()) };
  }
  detach(teamId, role, sid) {
    const t = this.teams[Number(teamId) - 1];
    if (t && ROLES.includes(role) && t.players[role].sid === sid) t.players[role].sid = null;
  }

  // ------------------------------------------------------------ vòng đời
  start() {
    if (this.phase !== 'lobby') return { ok: false, error: 'Chỉ bắt đầu được khi đang ở phòng chờ (hãy bấm "Làm lại" nếu trận trước đã xong).' };
    const t = this.now();
    this.startAt = t;
    this.endAt = t + this.settings.minutes * 60000;
    this.phase = 'running';
    this.lastTick = t;
    for (const team of this.teams) for (const r of PADDLERS) this._assignQuestion(team, r);
    this.emit('gameStart', { durationMs: this.endAt - this.startAt, teamCount: this.teams.length });
    return { ok: true };
  }

  endNow() {
    if (this.phase !== 'running' && this.phase !== 'king') return { ok: false, error: 'Không có trận nào đang diễn ra' };
    this._finish('time');
    return { ok: true };
  }

  _finish(reason, winnerId) {
    if (this.phase === 'finished') return;
    const ranked = this._ranked();
    const winner = winnerId ? this.teams[winnerId - 1] : ranked[0];
    this.phase = 'finished';
    this.result = {
      reason, winnerId: winner.id, winnerName: winner.name, winnerColor: winner.color,
      ranking: ranked.map((t, i) => ({ id: t.id, name: t.name, color: t.color, rank: i + 1, pct: +((t.pos / this.track) * 100).toFixed(1), energy: t.energy })),
    };
    this.emit('gameOver', this.result);
  }

  // ------------------------------------------------------------ câu hỏi
  _frac() { return this.phase === 'running' ? Math.min(1, Math.max(0, (this.now() - this.startAt) / (this.endAt - this.startAt))) : 0; }
  _level() { const f = this._frac(); return f < 1 / 3 ? 1 : f < 2 / 3 ? 2 : 3; } // độ khó tăng dần theo thời gian

  _pool(lv) {
    let pool = this.questions.filter((q) => q.level === lv);
    for (const d of [1, 2]) { if (pool.length) break; pool = this.questions.filter((q) => Math.abs(q.level - lv) === d); }
    return pool.length ? pool : this.questions;
  }

  /** Mỗi Người Chèo nhận câu hỏi RIÊNG: tránh câu đã làm và tránh trùng câu của đồng đội. */
  _assignQuestion(team, role) {
    const p = team.players[role];
    const pool = this._pool(this._level());
    const mates = new Set(PADDLERS.filter((r) => r !== role && team.players[r].q).map((r) => team.players[r].q.id));
    // Thứ tự ưu tiên: (1) chưa làm + không trùng đồng đội, cùng độ khó
    //                 (2) như (1) nhưng mở rộng mọi độ khó (khi ngân hàng câu hỏi nhỏ)
    //                 (3) làm lại câu cũ nhưng vẫn không trùng đồng đội
    //                 (4) bất kỳ câu nào (chỉ khi cả ngân hàng < 4 câu)
    const fresh = (list) => list.filter((q) => !p.seen.has(q.id) && !mates.has(q.id));
    const apart = (list) => list.filter((q) => !mates.has(q.id));
    let cand = fresh(pool);
    if (!cand.length) cand = fresh(this.questions);
    if (!cand.length) { pool.forEach((q) => p.seen.delete(q.id)); cand = apart(pool); }
    if (!cand.length) cand = apart(this.questions);
    if (!cand.length) cand = pool;
    p.q = cand[Math.floor(this.rng() * cand.length)];
    p.seen.add(p.q.id);
    this.resendQuestion(team.id, role);
  }
  resendQuestion(teamId, role) {
    const team = this.teams[Number(teamId) - 1];
    const p = team && team.players[role];
    if (this.phase === 'running' && p && p.q && PADDLERS.includes(role)) {
      this.emit('question', { id: p.q.id, text: p.q.q, level: p.q.level }, roomOf(team.id, role));
    }
  }

  // ------------------------------------------------------------ chuyển động
  _mult(team, t) {
    if (team.frozenUntil > t) return 0;
    let m = 1;
    if (team.windUntil > t) m *= CFG.WIND_MULT;
    if (team.anchorUntil > t) m *= CFG.ANCHOR_MULT;
    return m;
  }
  _advance(team, segments) {
    const t = this.now();
    team.pos = Math.min(this.track, team.pos + segments * this._mult(team, t));
    if (team.pos >= this.track - 1e-9) this._finish('finish', team.id);
  }

  // ------------------------------------------------------------ Người Chèo trả lời
  answer(teamId, role, text) {
    if (this.phase !== 'running') return { ok: false, error: 'Trận đấu chưa diễn ra hoặc đã kết thúc' };
    const team = this.teams[Number(teamId) - 1];
    if (!team || !PADDLERS.includes(role)) return { ok: false, error: 'Chỉ Người Chèo mới trả lời được' };
    const p = team.players[role];
    const t = this.now();
    if (team.frozenUntil > t) return { ok: false, locked: 'freeze', lockedMs: team.frozenUntil - t, error: 'Thuyền đang bị đóng băng' };
    if (p.blockedUntil > t) return { ok: false, locked: 'block', lockedMs: p.blockedUntil - t, error: 'Bạn đang bị chặn' };
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Hãy nhập đáp án' };
    if (!p.q) this._assignQuestion(team, role);

    if (sameAnswer(text.slice(0, 80), p.q.a)) {
      p.correct++;
      team.energy++;
      team.gold += CFG.GOLD_PER_ENERGY;
      const segment = team.energy % CFG.ENERGY_PER_SEGMENT === 0;
      this._advance(team, 1 / CFG.ENERGY_PER_SEGMENT);
      this.emit('effect', { type: 'correct', to: team.id, role, segment });
      if (this.phase === 'running') this._assignQuestion(team, role);
      return { ok: true, correct: true, energy: team.energy, gold: team.gold, segment, rewardGold: CFG.GOLD_PER_ENERGY };
    }
    p.wrong++;
    const ms = CFG.BLOCK_MS[0] + Math.floor(this.rng() * (CFG.BLOCK_MS[1] - CFG.BLOCK_MS[0] + 1));
    p.blockedUntil = t + ms;
    this.emit('effect', { type: 'wrong', to: team.id, role });
    this._assignQuestion(team, role); // đổi câu mới để không thể dò đáp án
    return { ok: true, correct: false, blockMs: ms };
  }

  // ------------------------------------------------------------ Hoa Tiêu mua vật phẩm
  _plan(team, eff, targetId, auto) {
    const n = this.now();
    if (eff === 'unlock') return n < team.frozenUntil ? { ok: true } : { ok: false, error: 'Thuyền của bạn chưa bị đóng băng' };
    if (eff === 'shield') return team.shield ? { ok: false, error: 'Thuyền đã có khiên rồi' } : { ok: true };
    if (ITEMS[eff].kind === 'self') return { ok: true };
    const valid = (o) => o.id !== team.id && !(eff === 'freeze' && o.frozenUntil > n) && !(eff === 'anchor' && o.anchorUntil > n);
    if (auto) {
      const c = this.teams.filter(valid);
      return c.length ? { ok: true, target: c[Math.floor(this.rng() * c.length)].id } : { ok: false, error: 'Không có đối thủ phù hợp' };
    }
    const o = this.teams[Number(targetId) - 1];
    if (!o) return { ok: false, error: 'Hãy chọn thuyền đối thủ' };
    if (o.id === team.id) return { ok: false, error: 'Không thể tấn công thuyền của mình' };
    if (!valid(o)) return { ok: false, error: eff === 'freeze' ? 'Đối thủ đang bị đóng băng rồi' : 'Đối thủ đang bị Mỏ Neo rồi' };
    return { ok: true, target: o.id };
  }

  buy(teamId, role, item, targetId) {
    if (this.phase === 'king') return { ok: false, error: '👑 Thuyền Vương: vật phẩm đã bị vô hiệu hóa' };
    if (this.phase !== 'running') return { ok: false, error: 'Trận đấu chưa diễn ra' };
    const team = this.teams[Number(teamId) - 1];
    if (!team || role !== 'navigator') return { ok: false, error: 'Chỉ Hoa Tiêu mới mua được vật phẩm' };
    const def = ITEMS[item];
    if (!def) return { ok: false, error: 'Vật phẩm không tồn tại' };
    if (team.gold < def.cost) return { ok: false, error: `Không đủ vàng (cần ${def.cost}, đang có ${team.gold})` };

    let eff = item, target = null, mystery = false;
    if (def.kind === 'random') {
      const options = [];
      for (const k of RANDOM_POOL) { const r = this._plan(team, k, null, true); if (r.ok) options.push([k, r.target]); }
      if (!options.length) return { ok: false, error: 'Chưa có vật phẩm phù hợp' };
      [eff, target] = options[Math.floor(this.rng() * options.length)];
      mystery = true;
    } else {
      const r = this._plan(team, eff, targetId, false);
      if (!r.ok) return r;
      target = r.target || null;
    }
    team.gold -= def.cost;
    this._apply(team, eff, target, mystery);
    return { ok: true, item, effect: eff, name: ITEMS[eff].name, icon: ITEMS[eff].icon, mystery, gold: team.gold };
  }

  _apply(team, eff, targetId, mystery) {
    const n = this.now();
    const base = { from: team.id, mystery, item: eff };
    if (eff === 'freeze' || eff === 'anchor') {
      const o = this.teams[targetId - 1];
      if (o.shield) {                              // Khiên chặn 1 lần tấn công
        o.shield = false;
        this.emit('effect', { ...base, type: 'shieldBlock', to: o.id });
      } else {
        if (eff === 'freeze') o.frozenUntil = n + CFG.FREEZE_MS; else o.anchorUntil = n + CFG.ANCHOR_MS;
        this.emit('effect', { ...base, type: eff, to: o.id });
      }
      return;
    }
    if (eff === 'unlock') team.frozenUntil = 0;
    if (eff === 'boost') team.boostUntil = n + CFG.BOOST_MS;
    if (eff === 'wind') team.windUntil = n + CFG.WIND_MS;
    if (eff === 'shield') team.shield = true;
    this.emit('effect', { ...base, type: eff, to: team.id });
  }

  // ------------------------------------------------------------ THUYỀN VƯƠNG
  _startKing() {
    this.phase = 'king';
    this.kingDone = true;
    this.kingIndex = 0;
    for (const t of this.teams) { t.boostUntil = t.windUntil = t.anchorUntil = t.frozenUntil = 0; } // tất cả thuyền dừng
    this._loadKing();
    this.emit('kingStart', { total: this.kingQuestions.length });
  }
  _loadKing() {
    const q = this.kingQuestions[this.kingIndex];
    this.king = { q, endsAt: this.now() + CFG.KING_QUESTION_MS, answered: new Map(), winner: null, winAt: 0 };
    this.emit('kingQuestion', { text: q.q, idx: this.kingIndex + 1, total: this.kingQuestions.length });
  }
  _nextKing() {
    this.kingIndex++;
    if (this.kingIndex >= this.kingQuestions.length) return this._finish('time');
    this._loadKing();
  }

  kingAnswer(teamId, role, text) {
    if (this.phase !== 'king' || !this.king) return { ok: false, error: 'Chưa đến giai đoạn Thuyền Vương' };
    const team = this.teams[Number(teamId) - 1];
    if (!team || !PADDLERS.includes(role)) return { ok: false, error: 'Chỉ Người Chèo mới gửi được đáp án' };
    const k = this.king;
    if (k.winner) return { ok: false, error: 'Đã có đội giành chiến thắng' };
    if (k.answered.has(team.id)) return { ok: false, error: 'Đội bạn đã gửi đáp án cho câu này rồi' };
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Hãy nhập đáp án' };
    const correct = sameAnswer(text.slice(0, 80), k.q.a);
    k.answered.set(team.id, { at: this.now(), correct });
    if (correct) {
      k.winner = team.id;
      k.winAt = this.now() + CFG.KING_WIN_MS;
      team.pos = this.track;       // tăng tốc cực đại, lao về đích
      team.dash = true;
      this.emit('kingWin', { teamId: team.id, name: team.name });
      return { ok: true, correct: true };
    }
    this.emit('kingAnswered', { teamId: team.id, name: team.name });
    return { ok: true, correct: false };
  }

  // ------------------------------------------------------------ vòng lặp
  _ranked() { return [...this.teams].sort((a, b) => b.pos - a.pos || b.energy - a.energy || a.id - b.id); }
  _leadPct() {
    const r = this._ranked();
    return r.length < 2 ? 0 : ((r[0].pos - r[1].pos) / this.track) * 100;
  }

  tick() {
    const t = this.now();
    const dt = Math.min(0.5, Math.max(0, (t - this.lastTick) / 1000));
    this.lastTick = t;

    if (this.phase === 'king') {
      const k = this.king;
      if (k.winner) { if (t >= k.winAt) this._finish('king', k.winner); return; }
      if (t >= k.endsAt || k.answered.size >= this.teams.length) this._nextKing();
      return;
    }
    if (this.phase !== 'running') return;

    for (const team of this.teams) {            // Tốc Biến: cộng quãng đường đều trong 2 giây
      if (team.boostUntil > t) this._advance(team, CFG.BOOST_SPEED * dt);
      if (this.phase !== 'running') return;
    }

    const frac = this._frac();
    const lead = this._leadPct();
    if (!this.earlyAt && frac >= CFG.EARLY_AT && lead >= CFG.EARLY_LEAD_PCT) {
      this.earlyAt = t + CFG.EARLY_COUNTDOWN_MS;  // đếm ngược 15 giây + hiện vạch đích
      this.emit('earlyStart', { endsInMs: CFG.EARLY_COUNTDOWN_MS });
    }
    if (this.earlyAt) { if (t >= this.earlyAt) this._finish('early'); return; }

    if (!this.kingDone && frac >= CFG.KING_AT) {  // 15% cuối, chưa ai vượt trội
      this.kingDone = true;
      if (this.teams.length >= 2 && this.kingQuestions.length) { this._startKing(); return; }
    }
    if (t >= this.endAt) this._finish('time');
  }

  // ------------------------------------------------------------ dữ liệu gửi client
  _rankMap() { return new Map(this._ranked().map((t, i) => [t.id, i + 1])); }
  _timeLeft() {
    if (this.phase === 'running') return Math.max(0, this.endAt - this.now());
    if (this.phase === 'lobby') return this.settings.minutes * 60000;
    return 0;
  }
  _pub(t, rank) {
    const n = this.now();
    const left = (u) => Math.max(0, u - n);
    return {
      id: t.id, name: t.name, color: t.color,
      pos: +t.pos.toFixed(3), pct: +((t.pos / this.track) * 100).toFixed(1), rank,
      energy: t.energy, seg: Math.floor(t.energy / CFG.ENERGY_PER_SEGMENT), gold: t.gold,
      frozenMs: left(t.frozenUntil), boostMs: left(t.boostUntil), windMs: left(t.windUntil), anchorMs: left(t.anchorUntil),
      shield: t.shield, dash: t.dash,
      online: PADDLERS.filter((r) => t.players[r].sid).length, nav: !!t.players.navigator.sid,
    };
  }
  _kingPub() {
    if (this.phase !== 'king' || !this.king) return null;
    const k = this.king;
    return { text: k.q.q, idx: this.kingIndex + 1, total: this.kingQuestions.length, endsInMs: Math.max(0, k.endsAt - this.now()), answered: [...k.answered.keys()], winnerId: k.winner };
  }

  /** Bản đầy đủ cho màn hình lớn + admin. */
  snapshot() {
    const rank = this._rankMap();
    const ranked = this._ranked();
    return {
      phase: this.phase, serverNow: this.now(), durationMs: this.settings.minutes * 60000, timeLeftMs: this._timeLeft(),
      track: this.track, level: this._level(), earlyMs: this.earlyAt ? Math.max(0, this.earlyAt - this.now()) : 0,
      leaderId: ranked[0] ? ranked[0].id : null, king: this._kingPub(), result: this.result,
      teams: this.teams.map((t) => this._pub(t, rank.get(t.id))),
    };
  }

  /** Bản gọn cho điện thoại của một đội (tiết kiệm băng thông khi có hàng trăm người). */
  teamView(teamId, withRivals) {
    const team = this.teams[teamId - 1];
    if (!team) return null;
    const ranked = this._ranked();
    const rank = new Map(ranked.map((t, i) => [t.id, i + 1]));
    const v = {
      phase: this.phase, timeLeftMs: this._timeLeft(), track: this.track, level: this._level(),
      earlyMs: this.earlyAt ? Math.max(0, this.earlyAt - this.now()) : 0,
      king: this._kingPub(), me: this._pub(team, rank.get(team.id)), teamCount: this.teams.length, result: this.result,
    };
    if (withRivals) {
      const n = this.now();
      v.rivals = ranked.filter((t) => t.id !== teamId).map((t) => ({ id: t.id, name: t.name, color: t.color, rank: rank.get(t.id), pct: +((t.pos / this.track) * 100).toFixed(1), frozen: t.frozenUntil > n, anchored: t.anchorUntil > n, shield: t.shield }));
    }
    return v;
  }
}

module.exports = { Game, CFG, ITEMS, ROLES, PADDLERS, ROLE_NAMES, roomOf, parseQuestions, sameAnswer, colorFor, defaultSettings };
