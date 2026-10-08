'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game, ITEMS, CFG, ROLES, ROLE_NAMES, roomOf } = require('./game');

// ====================================================================
// CẤU HÌNH QUA BIẾN MÔI TRƯỜNG (đều tùy chọn)
//   PORT            cổng (Render/Railway/Fly tự đặt)
//   ADMIN_KEY       mật khẩu trang quản trị (NÊN đặt khi deploy)
//   PUBLIC_URL      URL công khai, ví dụ https://imcboatracing.onrender.com
//                   (Render/Railway/Fly tự có sẵn nên thường KHÔNG cần đặt)
//   ALLOW_LOCAL_QR  =1 chỉ để thử nghiệm: cho phép sinh QR từ localhost/IP nội bộ
// ====================================================================
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ALLOW_LOCAL_QR = process.env.ALLOW_LOCAL_QR === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');   // mọi file client nằm ở đây
const DATA_FILE = path.join(__dirname, 'data', 'config.json');

// ---- kiểm tra file client ngay khi khởi động (tránh lỗi 404 âm thầm)
const REQUIRED = ['index.html', 'display.html', 'play.html', 'js/display.js', 'js/play.js', 'js/admin.js', 'js/sfx.js', 'css/style.css'];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(PUBLIC_DIR, f)));
if (missing.length) console.error('❌ THIẾU FILE trong thư mục public/:', missing.join(', '));

const app = express();
app.set('trust proxy', true);                         // đứng sau proxy của Render/Railway/Nginx
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 30000, cors: { origin: true } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.get('/admin', (req, res) => res.redirect('/'));
app.get('/display', (req, res) => res.redirect('/display.html'));
app.get('/play', (req, res) => res.redirect('/play.html' + req.url.slice(req.path.length)));

// ---------------------------------------------------------------- URL công khai
function publicBase(req) {
  let env = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN && 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN)
    || (process.env.FLY_APP_NAME && `https://${process.env.FLY_APP_NAME}.fly.dev`);
  if (env) { if (!/^https?:\/\//i.test(env)) env = 'https://' + env; return env.replace(/\/+$/, ''); }
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}`;
}
function isLocalBase(base) {
  try {
    const h = new URL(base).hostname;
    return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h) || h.endsWith('.local');
  } catch { return true; }
}

app.get('/api/info', (req, res) => {
  const base = publicBase(req);
  const local = isLocalBase(base);
  res.json({ needKey: !!ADMIN_KEY, base, localOnly: local, qrBlocked: local && !ALLOW_LOCAL_QR, roles: ROLE_NAMES, items: ITEMS });
});

// QR trỏ tới URL công khai, KHÔNG BAO GIỜ tới localhost (trừ khi ALLOW_LOCAL_QR=1 để thử)
app.get('/qr.png', async (req, res) => {
  const team = parseInt(req.query.team, 10);
  const role = String(req.query.role || '');
  if (!(team >= 1 && team <= CFG.MAX_TEAMS) || !ROLES.includes(role)) return res.status(400).type('text').send('team/role không hợp lệ');
  const base = publicBase(req);
  if (isLocalBase(base) && !ALLOW_LOCAL_QR) {
    return res.status(409).type('text').send('Đang chạy ở localhost/IP nội bộ nên không sinh QR. Hãy deploy lên Internet (xem README).');
  }
  try {
    const buf = await QRCode.toBuffer(`${base}/play.html?team=${team}&role=${role}`, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
    res.set('Cache-Control', 'no-store').type('png').send(buf);
  } catch (e) { res.status(500).type('text').send('Lỗi tạo QR'); }
});

// ---------------------------------------------------------------- Game
const game = new Game({ emit: (ev, payload, room) => (room ? io.to(room).emit(ev, payload) : io.emit(ev, payload)) });

try { // nạp cấu hình đã lưu (nếu có) để khởi động lại server không mất câu hỏi
  if (fs.existsSync(DATA_FILE)) {
    const r = game.configure(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    if (r.ok) console.log('Đã nạp cấu hình từ data/config.json');
  }
} catch (e) { console.warn('Không đọc được data/config.json:', e.message); }
function saveSettings() {
  try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(game.settings, null, 2)); } catch (e) { /* hosting chỉ-đọc: bỏ qua */ }
}

const teamRooms = (id, role) => [`t:${id}:${role === 'navigator' ? 'nav' : 'pad'}`, roomOf(id, role)];

function kickSockets(sids, reason) {
  for (const sid of sids) {
    const s = io.sockets.sockets.get(sid);
    if (s) { s.emit('kicked', { reason }); if (s.data.team) { teamRooms(s.data.team, s.data.role).forEach((r) => s.leave(r)); s.data = {}; } }
  }
}

io.on('connection', (socket) => {
  socket.data = {};
  let lastAct = 0;
  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});
  const throttled = () => { const n = Date.now(); if (n - lastAct < 120) return true; lastAct = n; return false; };
  const isAdmin = () => socket.data.admin === true;

  // ---------- Màn hình lớn
  socket.on('display:join', (cb) => { socket.join('display'); ack(cb)(game.snapshot()); });

  // ---------- Quản trị
  socket.on('admin:auth', ({ key } = {}, cb) => {
    if (ADMIN_KEY && key !== ADMIN_KEY) return ack(cb)({ ok: false, error: 'Sai mật khẩu quản trị' });
    socket.data.admin = true; socket.join('admin');
    ack(cb)({ ok: true, settings: game.settings, snapshot: game.snapshot() });
  });
  socket.on('admin:setup', (data, cb) => {
    if (!isAdmin()) return ack(cb)({ ok: false, error: 'Chưa đăng nhập quản trị' });
    const r = game.configure(data || {});
    if (r.ok) { saveSettings(); kickSockets(r.dropped, 'Đội của bạn không còn tồn tại sau khi admin đổi số đội. Hãy quét lại mã QR.'); io.emit('lobby', {}); }
    ack(cb)({ ...r, dropped: undefined });
  });
  socket.on('admin:start', (_, cb) => ack(cb)(isAdmin() ? game.start() : { ok: false, error: 'Chưa đăng nhập quản trị' }));
  socket.on('admin:reset', (_, cb) => {
    if (!isAdmin()) return ack(cb)({ ok: false, error: 'Chưa đăng nhập quản trị' });
    const r = game.reset(); ack(cb)({ ok: true });
  });
  socket.on('admin:end', (_, cb) => ack(cb)(isAdmin() ? game.endNow() : { ok: false, error: 'Chưa đăng nhập quản trị' }));

  // ---------- Người chơi vào thuyền qua QR: /play.html?team=1&role=p1
  socket.on('join', ({ team, role } = {}, cb) => {
    const teamId = parseInt(team, 10);
    if (socket.data.team) { game.detach(socket.data.team, socket.data.role, socket.id); teamRooms(socket.data.team, socket.data.role).forEach((r) => socket.leave(r)); }
    const r = game.attach(teamId, role, socket.id);
    if (!r.ok) return ack(cb)(r);
    if (r.replaced) {
      const old = io.sockets.sockets.get(r.replaced);
      if (old) { old.emit('replaced', {}); teamRooms(teamId, role).forEach((rm) => old.leave(rm)); old.data = {}; }
    }
    socket.data.team = teamId; socket.data.role = role;
    teamRooms(teamId, role).forEach((rm) => socket.join(rm));
    const view = game.teamView(teamId, role === 'navigator');
    ack(cb)({ ok: true, role, roleName: ROLE_NAMES[role], team: { id: teamId, name: view.me.name, color: view.me.color }, items: ITEMS, blockMs: r.blockMs, view });
    game.resendQuestion(teamId, role);
  });
  socket.on('answer', ({ answer } = {}, cb) => {
    if (throttled()) return ack(cb)({ ok: false, error: 'Chậm lại một chút' });
    ack(cb)(game.answer(socket.data.team, socket.data.role, answer));
  });
  socket.on('buy', ({ item, target } = {}, cb) => {
    if (throttled()) return ack(cb)({ ok: false, error: 'Chậm lại một chút' });
    ack(cb)(game.buy(socket.data.team, socket.data.role, item, target));
  });
  socket.on('king:answer', ({ answer } = {}, cb) => {
    ack(cb)(game.kingAnswer(socket.data.team, socket.data.role, answer));
  });

  socket.on('disconnect', () => { if (socket.data.team) game.detach(socket.data.team, socket.data.role, socket.id); });
});

// ---------------------------------------------------------------- vòng lặp
setInterval(() => { try { game.tick(); } catch (e) { console.error('tick lỗi:', e); } }, 100);

// Màn hình lớn + admin: dữ liệu đầy đủ (4 lần/giây)
setInterval(() => { io.to('display').to('admin').emit('state', game.snapshot()); }, 250);

// Điện thoại: chỉ gửi dữ liệu của đội mình (2 lần/giây) để chịu được hàng trăm người chơi
setInterval(() => {
  for (const t of game.teams) {
    io.to(`t:${t.id}:pad`).emit('me', game.teamView(t.id, false));
    io.to(`t:${t.id}:nav`).emit('me', game.teamView(t.id, true));
  }
}, 500);

process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏆 IMC BOAT RACING đang chạy (cổng ${PORT})`);
  console.log(`   Quản trị    : /            Màn hình lớn: /display.html`);
  if (!ADMIN_KEY) console.warn('   ⚠️  Chưa đặt ADMIN_KEY: ai có link cũng vào được trang quản trị. Hãy đặt biến môi trường ADMIN_KEY khi deploy.');
  console.log('');
});
