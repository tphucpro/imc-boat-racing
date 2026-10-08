const socket = io();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";

// ======================================================= BỐ CỤC (tự co giãn theo số đội)
const W = 1100, LEFT = 190, START_X = LEFT + 20, FINISH_X = W - 70, TOP = 14;
let snap = null, snapAt = 0, phaser = null, scene = null, curN = 0, laneH = 60, H = 400;

function layout(n) {
  laneH = Math.max(46, Math.min(110, Math.floor(480 / n)));
  H = Math.max(380, n * laneH + TOP * 2);
}
function ensureGame(n) {
  if (phaser && curN === n) return;
  if (phaser) { phaser.destroy(true); phaser = null; scene = null; }
  layout(n); curN = n;
  phaser = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#0f5e86',
    scale: { mode: Phaser.Scale.WIDTH_CONTROLS_HEIGHT, autoCenter: Phaser.Scale.NO_CENTER },
    scene: RaceScene,
  });
}

// ======================================================= PHASER
class RaceScene extends Phaser.Scene {
  create() {
    scene = this;
    this.boats = {};
    this.earlyX = null;
    // Sóng nước vẽ bằng code (không cần file ảnh)
    const mk = (key, base, lineA) => {
      const g = this.make.graphics({ add: false });
      g.fillStyle(base).fillRect(0, 0, 96, 96);
      g.lineStyle(3, 0xffffff, lineA);
      for (let y = 14; y < 96; y += 32) {
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= 96; x += 24) g.lineTo(x + 12, y + (x / 24 % 2 ? -6 : 6));
        g.strokePath();
      }
      g.generateTexture(key, 96, 96); g.destroy();
    };
    mk('wave', 0x0f5e86, 0.22); mk('wave2', 0x1b9aaa, 0.35);
    this.water = this.add.tileSprite(0, 0, W, H, 'wave').setOrigin(0).setDepth(0);
    this.water2 = this.add.tileSprite(0, 0, W, H, 'wave2').setOrigin(0).setAlpha(0.25).setDepth(1);

    const g = this.add.graphics().setDepth(2);
    for (let i = 0; i < curN; i++) {
      g.fillStyle(i % 2 ? 0x000000 : 0xffffff, 0.06).fillRect(0, TOP + i * laneH, W, laneH);
      g.lineStyle(1, 0xffffff, 0.2).lineBetween(0, TOP + i * laneH, W, TOP + i * laneH);
    }
    g.lineStyle(1, 0xffffff, 0.2).lineBetween(0, TOP + curN * laneH, W, TOP + curN * laneH);
    g.fillStyle(0xffffff, 0.75).fillRect(START_X - 8, TOP, 4, curN * laneH);
    const sq = 12; // vạch đích caro
    for (let y = TOP, r = 0; y < TOP + curN * laneH; y += sq, r++) {
      g.fillStyle(r % 2 ? 0xffffff : 0x111111).fillRect(FINISH_X, y, sq, sq);
      g.fillStyle(r % 2 ? 0x111111 : 0xffffff).fillRect(FINISH_X + sq, y, sq, sq);
    }
    this.fx = this.add.layer().setDepth(50);
    this.earlyG = this.add.graphics().setDepth(5);
    this.sc = Math.min(1.5, (laneH * 0.8) / 54);
    this.boatW = 104 * this.sc;
  }

  xFor(pos) { return START_X + (pos / snap.track) * (FINISH_X - START_X - this.boatW * 0.9); }

  boatTexture(t) {
    const key = 'boat' + t.id;
    if (this.textures.exists(key)) return key;
    const c = Phaser.Display.Color.HexStringToColor(t.color).color;
    const g = this.make.graphics({ add: false });
    g.fillStyle(c).fillRect(6, 38, 78, 12).fillTriangle(84, 38, 84, 50, 102, 38);   // thân + mũi
    g.fillStyle(0x000000, 0.25).fillRect(6, 46, 78, 4);
    g.fillStyle(0xffffff).fillRect(6, 38, 78, 3);
    [18, 34, 50, 66].forEach((x) => { g.fillStyle(0x06223b).fillCircle(x, 32, 5); g.fillStyle(0xffd9a0).fillCircle(x, 26, 3.5); }); // 4 người chèo
    g.fillStyle(0xffb703).fillCircle(86, 32, 5);                                      // hoa tiêu
    g.lineStyle(2, 0x3b2a1a).lineBetween(86, 28, 86, 8);
    g.fillStyle(0xffffff).fillTriangle(86, 8, 86, 20, 100, 14);                       // cờ
    g.generateTexture(key, 104, 54); g.destroy();
    return key;
  }

  makeBoat(t, i) {
    const y = TOP + i * laneH + laneH / 2, sc = this.sc, w = this.boatW;
    const root = this.add.container(START_X, y).setDepth(10);
    const sprite = this.add.image(0, 0, this.boatTexture(t)).setScale(sc);
    const ice = this.add.rectangle(0, 0, w + 16, 54 * sc + 8, 0xbff3ff, 0.55).setStrokeStyle(3, 0xffffff, 0.9).setVisible(false);
    const shield = this.add.circle(0, 0, w * 0.55, 0x7fd0ff, 0.2).setStrokeStyle(3, 0x7fd0ff).setVisible(false);
    const trail = this.add.rectangle(-w / 2 - 24, 8 * sc, 60, 6 * sc, 0xffe066, 0.9).setVisible(false);
    const tag = this.add.text(0, -27 * sc - 4, '', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#fff', stroke: '#06223b', strokeThickness: 3 }).setOrigin(0.5, 1);
    root.add([trail, sprite, ice, shield, tag]);
    const nm = t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name;
    const label = this.add.text(10, y, nm, { fontFamily: FONT, fontSize: Math.round(Math.min(19, laneH * 0.38)) + 'px', fontStyle: '900', color: '#fff', stroke: '#06223b', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(11);
    return (this.boats[t.id] = { root, ice, shield, trail, tag, label, y, lane: i });
  }

  update(time, delta) {
    this.water.tilePositionX += 0.5; this.water2.tilePositionX -= 0.8;
    if (!snap) return;
    const el = Date.now() - snapAt;
    snap.teams.forEach((t, i) => {
      const b = this.boats[t.id] || this.makeBoat(t, i);
      const k = 1 - Math.pow(1 - (t.dash ? 0.2 : 0.08), delta / 16.67);
      b.root.x += (this.xFor(t.pos) - b.root.x) * k;
      const frozen = t.frozenMs - el > 0;
      b.root.y = b.y + (frozen ? 0 : Math.sin(time / 350 + t.id) * (laneH > 52 ? 3 : 1.5));
      b.root.rotation = frozen ? 0 : Math.sin(time / 500 + t.id) * 0.03;
      b.ice.setVisible(frozen);
      b.shield.setVisible(t.shield);
      const boosting = t.boostMs - el > 0;
      b.trail.setVisible(boosting); if (boosting) b.trail.width = 40 + Math.random() * 50;
      b.tag.setText((t.windMs - el > 0 ? '🌪' : '') + (t.anchorMs - el > 0 ? '⚓' : '') + Math.round(t.pct) + '%');
    });
    // Vạch đích hiện ra khi đếm ngược kết thúc sớm
    this.earlyG.clear();
    if (snap.earlyMs - el > 0) {
      if (this.earlyX == null) {
        const lead = snap.teams.find((x) => x.id === snap.leaderId);
        this.earlyX = Math.min(FINISH_X - 40, this.xFor(lead.pos) + this.boatW * 0.6 + 170);
      }
      const pulse = 0.65 + 0.35 * Math.sin(time / 120), sq = 12;
      for (let y = TOP, r = 0; y < TOP + curN * laneH; y += sq, r++) {
        this.earlyG.fillStyle(r % 2 ? 0xffffff : 0x111111, pulse).fillRect(this.earlyX, y, sq, sq);
        this.earlyG.fillStyle(r % 2 ? 0x111111 : 0xffffff, pulse).fillRect(this.earlyX + sq, y, sq, sq);
      }
    } else this.earlyX = null;
  }

  // ---------- hiệu ứng
  at(id) { return this.boats[id]; }
  floatText(id, msg, color = '#ffd166') {
    const b = this.at(id); if (!b) return;
    const t = this.add.text(b.root.x, b.root.y - 24, msg, { fontFamily: FONT, fontSize: '20px', fontStyle: '900', color, stroke: '#06223b', strokeThickness: 4 }).setOrigin(0.5);
    this.fx.add(t);
    this.tweens.add({ targets: t, y: t.y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
  lightning(from, to) { // tia sét
    const a = this.at(from), b = this.at(to); if (!a || !b) return;
    const g = this.add.graphics(); this.fx.add(g);
    g.lineStyle(5, 0xfff27a, 1).beginPath().moveTo(a.root.x, a.root.y);
    for (let i = 1; i < 9; i++) {
      const k = i / 9;
      g.lineTo(a.root.x + (b.root.x - a.root.x) * k + Phaser.Math.Between(-26, 26), a.root.y + (b.root.y - a.root.y) * k + Phaser.Math.Between(-18, 18));
    }
    g.lineTo(b.root.x, b.root.y).strokePath();
    this.cameras.main.flash(160, 255, 255, 190);
    this.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }
  snow(id) { // băng tuyết
    const b = this.at(id); if (!b) return;
    for (let i = 0; i < 26; i++) {
      const s = this.add.circle(b.root.x + Phaser.Math.Between(-70, 70), b.root.y - Phaser.Math.Between(30, 70), Phaser.Math.Between(2, 5), 0xffffff, 0.95);
      this.fx.add(s);
      this.tweens.add({ targets: s, y: s.y + 80, x: s.x + Phaser.Math.Between(-20, 20), alpha: 0, duration: Phaser.Math.Between(700, 1400), delay: i * 25, onComplete: () => s.destroy() });
    }
  }
  speedLines(id, color = 0xffe066) { // tăng tốc
    const b = this.at(id); if (!b) return;
    for (let i = 0; i < 12; i++) {
      const l = this.add.rectangle(b.root.x - 30, b.root.y + Phaser.Math.Between(-20, 20), Phaser.Math.Between(40, 110), 3, color, 0.9);
      this.fx.add(l);
      this.tweens.add({ targets: l, x: l.x - 160, alpha: 0, duration: 450, delay: i * 35, onComplete: () => l.destroy() });
    }
  }
  ring(id, color) {
    const b = this.at(id); if (!b) return;
    const r = this.add.circle(b.root.x, b.root.y, 26).setStrokeStyle(4, color); this.fx.add(r);
    this.tweens.add({ targets: r, scale: 3.2, alpha: 0, duration: 650, onComplete: () => r.destroy() });
  }
  confetti() { // hiệu ứng chiến thắng
    const cols = [0xffb703, 0xfb5607, 0x2ec27e, 0x12a4b5, 0xff5d8f, 0xffffff];
    const view = this.cameras.main.worldView;
    for (let i = 0; i < 160; i++) {
      const p = this.add.rectangle(Phaser.Math.Between(0, W), view.y - 20, Phaser.Math.Between(6, 12), Phaser.Math.Between(10, 18), Phaser.Utils.Array.GetRandom(cols));
      p.setDepth(100).setRotation(Math.random() * 3);
      this.tweens.add({ targets: p, y: view.y + Math.min(H, 700) + 40, x: p.x + Phaser.Math.Between(-120, 120), rotation: p.rotation + 8, duration: Phaser.Math.Between(1800, 3600), delay: Math.random() * 1200, onComplete: () => p.destroy() });
    }
  }
}

// ======================================================= DỮ LIỆU TỪ SERVER
const nameOf = (id) => (snap && snap.teams.find((t) => t.id === id)?.name) || 'Đội ' + id;
function feed(msg) {
  const d = document.createElement('div'); d.textContent = msg; $('feed').prepend(d);
  while ($('feed').children.length > 7) $('feed').lastChild.remove();
}
let overShown = false;

socket.on('connect', () => socket.emit('display:join', onState));
socket.on('state', onState);

function onState(s) {
  snap = s; snapAt = Date.now();
  ensureGame(s.teams.length);

  // Bảng xếp hạng trực tiếp
  const ranked = [...s.teams].sort((a, b) => a.rank - b.rank);
  $('board').innerHTML = ranked.map((t) => `<li style="--c:${t.color}">
      <span class="pos">${t.rank}</span>
      <span><b>${esc(t.name)}</b><br><span class="meta">${Math.round(t.pct)}% · ⚡${t.energy} · 💰${t.gold} · 👥${t.online + (t.nav ? 1 : 0)}/5</span></span>
      <span class="st">${t.frozenMs > 0 ? '❄️' : t.boostMs > 0 ? '⚡' : t.anchorMs > 0 ? '⚓' : t.windMs > 0 ? '🌪' : t.shield ? '🛡️' : ''}</span></li>`).join('');

  $('lobby').classList.toggle('hidden', s.phase !== 'lobby');
  $('banner').textContent = s.phase === 'running' ? 'Độ khó: ' + '★'.repeat(s.level) : s.phase === 'king' ? '👑 THUYỀN VƯƠNG' : '';

  // Thuyền Vương
  const k = s.king;
  $('king').classList.toggle('hidden', !k);
  if (k) {
    $('kingQ').textContent = k.text;
    $('kingChips').innerHTML = s.teams.map((t) => `<span class="chip ${k.answered.includes(t.id) ? 'done' : ''}" style="--c:${t.color}">${k.winnerId === t.id ? '🏆 ' : k.answered.includes(t.id) ? '✔ ' : ''}${esc(t.name)}</span>`).join('');
  }

  // Kết quả
  if (s.phase === 'finished' && s.result) {
    $('over').classList.remove('hidden');
    const r = s.result;
    $('overTitle').textContent = '🏆 ' + r.winnerName;
    $('overWhy').textContent = { finish: 'về đích đầu tiên!', early: 'vượt trội, kết thúc sớm!', king: 'đăng quang Thuyền Vương!', time: 'dẫn đầu khi hết giờ!' }[r.reason];
    $('overRank').innerHTML = r.ranking.slice(0, 10).map((t) => `<div>${t.rank}. ${esc(t.name)} — ${Math.round(t.pct)}%</div>`).join('');
    if (!overShown) { overShown = true; SFX.victory(); if (scene) scene.confetti(); }
  } else { $('over').classList.add('hidden'); overShown = false; }
}

// Đồng hồ + đếm ngược (nội suy giữa 2 lần nhận dữ liệu)
setInterval(() => {
  if (!snap) return;
  const el = Date.now() - snapAt;
  $('timer').textContent = snap.phase === 'running' ? fmt(snap.timeLeftMs - el) : snap.phase === 'lobby' ? fmt(snap.durationMs) : snap.phase === 'king' ? '👑' : '🏁';
  const early = snap.earlyMs - el;
  $('early').classList.toggle('hidden', !(snap.phase === 'running' && early > 0));
  if (early > 0) $('early').textContent = `🏁 Vạch đích xuất hiện! Kết thúc sớm sau ${Math.ceil(early / 1000)} giây`;
  if (snap.king) $('kingTime').textContent = snap.king.winnerId ? '🎉 ' + nameOf(snap.king.winnerId) + ' trả lời đúng!' : '⏱ ' + fmt(snap.king.endsInMs - el);
  $('btnSound').textContent = SFX.isRunning() ? '🔊 Âm thanh: bật' : '🔇 Bấm để bật âm thanh';
}, 200);
$('btnSound').onclick = () => { SFX.enable(); SFX.item(); };

// ======================================================= SỰ KIỆN
const FX_FEED = {
  freeze: (e) => `❄️ ${nameOf(e.from)} đóng băng ${nameOf(e.to)}!`,
  anchor: (e) => `⚓ ${nameOf(e.from)} thả neo ${nameOf(e.to)}!`,
  shieldBlock: (e) => `🛡️ ${nameOf(e.to)} chặn đòn của ${nameOf(e.from)}!`,
  boost: (e) => `⚡ ${nameOf(e.to)} tốc biến!`,
  wind: (e) => `🌪 ${nameOf(e.to)} đón gió thuận!`,
  shield: (e) => `🛡️ ${nameOf(e.to)} dựng khiên!`,
  unlock: (e) => `🔓 ${nameOf(e.to)} phá băng!`,
};
socket.on('effect', (e) => {
  if (e.type === 'correct') { SFX.correct(); if (scene && e.segment) scene.floatText(e.to, '+1 đoạn!'); else if (scene) scene.floatText(e.to, '+⚡', '#8be9b5'); return; }
  if (e.type === 'wrong') { if (scene) scene.floatText(e.to, '✗', '#ff7b7b'); return; }
  if (FX_FEED[e.type]) feed((e.mystery ? '🎲 Hòm Bí Ẩn: ' : '') + FX_FEED[e.type](e));
  if (!scene) return;
  switch (e.type) {
    case 'freeze': SFX.freeze(); scene.lightning(e.from, e.to); scene.snow(e.to); break;
    case 'anchor': SFX.anchor(); scene.ring(e.to, 0x888888); scene.floatText(e.to, '⚓', '#cccccc'); break;
    case 'shieldBlock': SFX.shield(); scene.ring(e.to, 0x7fd0ff); break;
    case 'boost': SFX.boost(); scene.speedLines(e.to); break;
    case 'wind': SFX.boost(); scene.speedLines(e.to, 0xbff3ff); break;
    case 'shield': SFX.shield(); scene.ring(e.to, 0x7fd0ff); break;
    case 'unlock': SFX.shield(); scene.ring(e.to, 0xffe066); break;
  }
});
socket.on('gameStart', () => { $('feed').innerHTML = ''; feed('🏁 Cuộc đua bắt đầu!'); SFX.item(); });
socket.on('earlyStart', () => { feed('⏱ Có đội vượt trội: đếm ngược 15 giây!'); SFX.king(); });
socket.on('kingStart', () => { feed('👑 THUYỀN VƯƠNG bắt đầu! Mọi thuyền dừng lại.'); SFX.king(); });
socket.on('kingQuestion', (q) => feed(`👑 Câu ${q.idx}/${q.total} đã hiện`));
socket.on('kingAnswered', (e) => feed(`✉️ ${e.name} đã gửi đáp án`));
socket.on('kingWin', (e) => { feed(`🏆 ${e.name} trả lời đúng! Lao về đích!`); SFX.victory(); if (scene) scene.speedLines(e.teamId, 0xffffff); });
socket.on('lobby', () => { $('feed').innerHTML = ''; });
