'use strict';
// Chạy: npm test   (mô phỏng toàn bộ luật chơi bằng đồng hồ giả, không cần mạng)
const assert = require('assert');
const { Game, CFG, defaultSettings, sameAnswer, parseQuestions } = require('../game');

let clock = 1_000_000;
const events = [];
const mk = (over = {}) => {
  clock = 1_000_000; events.length = 0;
  return new Game({ now: () => clock, rng: () => 0.5, emit: (ev, p, room) => events.push({ ev, p, room }), settings: { ...defaultSettings(), ...over } });
};
const advance = (ms, g) => { for (let i = 0; i < ms / 100; i++) { clock += 100; g.tick(); } };
const has = (ev, f = () => true) => events.some((e) => e.ev === ev && f(e.p));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

console.log('IMC BOAT RACING - kiểm tra logic');

test('số đội động: 3 / 10 / 20 / 50 đội', () => {
  for (const n of [3, 10, 20, 50]) {
    const g = mk({ teamCount: n });
    assert.strictEqual(g.snapshot().teams.length, n);
    assert.strictEqual(new Set(g.teams.map((t) => t.color)).size, n, 'màu đội phải khác nhau');
  }
  assert.strictEqual(mk().configure({ ...defaultSettings(), teamCount: 51 }).ok, false);
  assert.strictEqual(mk().configure({ ...defaultSettings(), teamCount: 0 }).ok, false);
});

test('đọc câu hỏi & so khớp đáp án (số, thập phân, phân số)', () => {
  const r = parseQuestions('a | b | 2\nx | y\nsai dòng\n# ghi chú', true);
  assert.strictEqual(r.list.length, 2); assert.strictEqual(r.errors.length, 1);
  assert.ok(sameAnswer('1,25', '5/4')); assert.ok(sameAnswer(' 42 ', 42)); assert.ok(!sameAnswer('41', 42));
});

test('mỗi Người Chèo nhận câu hỏi khác nhau', () => {
  const g = mk(); g.start();
  const ids = ['p1', 'p2', 'p3', 'p4'].map((r) => g.teams[0].players[r].q.id);
  assert.strictEqual(new Set(ids).size, 4);
  assert.strictEqual(events.filter((e) => e.ev === 'question').length, 16); // 4 đội x 4 người
});

test('đúng: +1 năng lượng, +10 vàng; 4 năng lượng = 1 đoạn', () => {
  const g = mk(); g.start();
  const t = g.teams[0];
  for (let i = 0; i < 4; i++) {
    const r = g.answer(1, 'p' + (i + 1), String(t.players['p' + (i + 1)].q.a));
    assert.ok(r.ok && r.correct);
  }
  assert.strictEqual(t.energy, 4); assert.strictEqual(t.gold, 40);
  assert.ok(Math.abs(t.pos - 1) < 1e-9, 'pos=' + t.pos);
});

test('sai: bị chặn 3-5 giây và đổi sang câu mới', () => {
  const g = mk(); g.start();
  const before = g.teams[0].players.p1.q.id;
  const r = g.answer(1, 'p1', 'sai-be-bet');
  assert.ok(r.ok && !r.correct && r.blockMs >= 3000 && r.blockMs <= 5000);
  assert.notStrictEqual(g.teams[0].players.p1.q.id, before);
  assert.strictEqual(g.answer(1, 'p1', '1').locked, 'block');
  assert.ok(g.answer(1, 'p2', String(g.teams[0].players.p2.q.a)).correct, 'người khác vẫn chơi được');
  advance(5100, g);
  assert.ok(g.answer(1, 'p1', String(g.teams[0].players.p1.q.a)).ok);
});

test('độ khó tăng dần theo thời gian', () => {
  const g = mk({ minutes: 3 }); g.start();
  assert.strictEqual(g._level(), 1); advance(70000, g);
  assert.strictEqual(g._level(), 2); advance(60000, g);
  assert.strictEqual(g._level(), 3);
});

test('vật phẩm: giá vàng, Băng Sương, Khiên, Mở Trói', () => {
  const g = mk(); g.start();
  g.teams[0].gold = 500;
  assert.ok(!g.buy(1, 'p1', 'freeze', 2).ok, 'Người Chèo không được mua');
  assert.ok(!g.buy(1, 'navigator', 'freeze', 1).ok, 'không tự đóng băng mình');
  assert.ok(g.buy(1, 'navigator', 'freeze', 2).ok); assert.strictEqual(g.teams[0].gold, 450);
  assert.ok(g.teams[1].frozenUntil > clock);
  assert.strictEqual(g.answer(2, 'p1', '1').locked, 'freeze');
  assert.ok(!g.buy(1, 'navigator', 'freeze', 2).ok, 'không đóng băng chồng');
  g.teams[2].gold = 500; g.buy(3, 'navigator', 'shield');           // đội 3 bật khiên
  g.buy(1, 'navigator', 'freeze', 3);
  assert.ok(!g.teams[2].shield && g.teams[2].frozenUntil === 0, 'khiên chặn đòn');
  assert.ok(has('effect', (p) => p.type === 'shieldBlock'));
  g.teams[1].gold = 100; assert.ok(g.buy(2, 'navigator', 'unlock').ok);
  assert.strictEqual(g.teams[1].frozenUntil, 0);
  g.teams[3].gold = 10; assert.ok(!g.buy(4, 'navigator', 'boost').ok, 'thiếu vàng');
});

test('Tốc Biến / Gió Thuận / Mỏ Neo ảnh hưởng tốc độ đúng', () => {
  const g = mk(); g.start(); g.teams[0].gold = 1000;
  g.buy(1, 'navigator', 'boost'); advance(2200, g);
  assert.ok(g.teams[0].pos > 1.1 && g.teams[0].pos < 1.3, 'Tốc Biến ~1.2 đoạn, thực tế ' + g.teams[0].pos);
  const t = g.teams[0]; t.pos = 0; t.energy = 0;
  g.buy(1, 'navigator', 'wind'); g.answer(1, 'p1', String(t.players.p1.q.a));
  assert.ok(Math.abs(t.pos - 0.3125) < 1e-9, 'Gió Thuận +25%');
  t.pos = 0; g.teams[1].gold = 1000; g.buy(2, 'navigator', 'anchor', 1);
  assert.ok(t.anchorUntil > clock); g.answer(1, 'p2', String(t.players.p2.q.a));
  assert.ok(Math.abs(t.pos - 0.125 * 1.25) < 1e-9, 'Mỏ Neo -50% (kèm gió): ' + t.pos);
});

test('Hòm Bí Ẩn trả vật phẩm ngẫu nhiên hợp lệ', () => {
  for (let i = 0; i < 20; i++) {
    const g = new Game({ now: () => clock, rng: Math.random, emit: () => {}, settings: defaultSettings() }); g.start();
    g.teams[0].gold = 100; const r = g.buy(1, 'navigator', 'mystery');
    assert.ok(r.ok && r.mystery && r.effect !== 'mystery'); assert.strictEqual(g.teams[0].gold, 60);
  }
});

test('về đích trước thì thắng', () => {
  const g = mk({ track: 5 }); g.start(); const t = g.teams[2];
  for (let i = 0; i < 20 && g.phase === 'running'; i++) ['p1', 'p2', 'p3', 'p4'].forEach((r) => { if (g.phase === 'running') g.answer(3, r, String(t.players[r].q.a)); });
  assert.strictEqual(g.phase, 'finished'); assert.strictEqual(g.result.winnerId, 3); assert.strictEqual(g.result.reason, 'finish');
});

test('kết thúc sớm: sau 50% thời gian, dẫn >= 25% => đếm ngược 15s', () => {
  const g = mk({ minutes: 10, track: 40 }); g.start();
  g.teams[0].pos = 20;                                  // dẫn 50% đường đua nhưng chưa tới 50% thời gian
  advance(60000, g); assert.ok(!g.earlyAt, 'chưa đủ 50% thời gian thì chưa kết thúc sớm');
  advance(241000, g); assert.ok(g.earlyAt, 'đã đủ 50% -> đếm ngược');
  assert.ok(has('earlyStart'));
  advance(13000, g); assert.strictEqual(g.phase, 'running');
  advance(3000, g); assert.strictEqual(g.phase, 'finished'); assert.strictEqual(g.result.reason, 'early'); assert.strictEqual(g.result.winnerId, 1);
});

test('Thuyền Vương: kích hoạt ở 15% cuối khi chưa ai vượt trội', () => {
  const g = mk({ minutes: 10 }); g.start(); g.teams[0].pos = 3; g.teams[1].pos = 2;
  advance(509000, g); assert.strictEqual(g.phase, 'running');
  advance(2000, g); assert.strictEqual(g.phase, 'king');
  g.teams[0].gold = 999; assert.ok(!g.buy(1, 'navigator', 'boost').ok, 'vật phẩm bị vô hiệu hóa');
  assert.ok(!g.answer(1, 'p1', '1').ok, 'trả lời thường bị khóa');
  const p0 = g.teams.map((t) => t.pos); advance(3000, g); assert.deepStrictEqual(g.teams.map((t) => t.pos), p0, 'thuyền dừng');
  assert.ok(!g.kingAnswer(1, 'navigator', '220').ok, 'chỉ Người Chèo gửi đáp án');
  const r1 = g.kingAnswer(2, 'p1', '000'); assert.ok(r1.ok && !r1.correct);
  assert.ok(!g.kingAnswer(2, 'p2', '220').ok, 'mỗi đội chỉ 1 đáp án');
  const r2 = g.kingAnswer(3, 'p4', '220'); assert.ok(r2.correct);
  assert.strictEqual(g.teams[2].pos, g.track);
  assert.ok(!g.kingAnswer(1, 'p1', '220').ok, 'đã có người thắng');
  advance(4200, g); assert.strictEqual(g.phase, 'finished'); assert.strictEqual(g.result.winnerId, 3); assert.strictEqual(g.result.reason, 'king');
});

test('Thuyền Vương: hết giờ không ai đúng -> câu tiếp theo, hết câu -> xếp hạng', () => {
  const g = mk({ minutes: 1, kingText: 'Q1 | 1\nQ2 | 2' }); g.start(); g.teams[1].pos = 1;
  advance(52000, g); assert.strictEqual(g.phase, 'king'); assert.strictEqual(g.kingIndex, 0);
  advance(46000, g); assert.strictEqual(g.kingIndex, 1);
  advance(46000, g); assert.strictEqual(g.phase, 'finished'); assert.strictEqual(g.result.winnerId, 2);
});

test('hết giờ bình thường & làm lại ván mới', () => {
  const g = mk({ minutes: 1, kingText: '' }); g.start(); g.teams[1].pos = 1;
  advance(61000, g); assert.strictEqual(g.phase, 'finished'); assert.strictEqual(g.result.reason, 'time');
  g.reset(); assert.strictEqual(g.phase, 'lobby'); assert.ok(g.teams.every((t) => t.pos === 0 && t.gold === 0));
  assert.ok(g.start().ok);
});

test('đổi cấu hình giữa chừng bị chặn; kết nối được giữ khi đổi số đội', () => {
  const g = mk(); g.attach(2, 'p1', 'sidA'); g.attach(4, 'navigator', 'sidB');
  const r = g.configure({ ...defaultSettings(), teamCount: 3 });
  assert.ok(r.ok); assert.deepStrictEqual(r.dropped, ['sidB']); assert.strictEqual(g.teams[1].players.p1.sid, 'sidA');
  g.start(); assert.ok(!g.configure(defaultSettings()).ok);
  assert.ok(!g.attach(9, 'p1', 'x').ok); assert.ok(!g.attach(1, 'p9', 'x').ok);
});

console.log(`\nTất cả ${passed} nhóm kiểm tra đều đạt ✅`);
