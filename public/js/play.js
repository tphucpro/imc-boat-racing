const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

// Vai trò lấy tự động từ link trong mã QR:  /play.html?team=1&role=p1
const params = new URLSearchParams(location.search);
const teamId = parseInt(params.get('team'), 10);
const role = params.get('role');
const isNav = role === 'navigator';
const VALID_ROLES = ['p1', 'p2', 'p3', 'p4', 'navigator'];

let view = null, viewAt = 0, info = null, items = {};
let question = null, blockedUntil = 0, target = null, sending = false, fatal = false, rivalSig = '', shopBuilt = false;
const socket = io();

function showFatal(msg) {
  fatal = true;
  ['wait', 'stats', 'qsec', 'shop', 'over'].forEach((id) => $(id).classList.add('hidden'));
  $('fatal').classList.remove('hidden'); $('fatalMsg').textContent = msg;
}
if (!(teamId >= 1) || !VALID_ROLES.includes(role)) showFatal('Link không hợp lệ. Hãy quét lại mã QR của đội bạn.');

let toastTimer = null;
function toast(msg, ms = 2300) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// ------------------------------------------------------------- kết nối
socket.on('connect', () => {
  if (fatal) return;
  socket.emit('join', { team: teamId, role }, (res) => {
    if (!res.ok) return showFatal(res.error);
    info = res; items = res.items; view = res.view; viewAt = Date.now();
    blockedUntil = Date.now() + (res.blockMs || 0);
    document.documentElement.style.setProperty('--c', res.team.color);
    $('who').textContent = res.team.name;
    $('sub').textContent = res.roleName + (isNav ? ' 🧭' : ' 🚣');
    if (isNav && !shopBuilt) buildShop();
    render();
  });
});
socket.on('disconnect', () => toast('Mất kết nối, đang kết nối lại…', 4000));
socket.on('replaced', () => showFatal('Vai trò này vừa được mở ở thiết bị khác. Hãy quét lại QR nếu muốn quay lại.'));
socket.on('kicked', (e) => showFatal(e.reason || 'Bạn đã bị ngắt khỏi đội.'));

socket.on('me', (v) => { view = v; viewAt = Date.now(); render(); });
socket.on('question', (q) => { question = q; $('ans').value = ''; render(); });

// ------------------------------------------------------------- sự kiện
socket.on('effect', (e) => {
  if (!view) return;
  const mine = e.to === teamId;
  if (e.type === 'freeze' && mine) { toast('❄️ Thuyền của bạn bị đóng băng!'); SFX.freeze(); }
  else if (e.type === 'anchor' && mine) { toast('⚓ Thuyền của bạn bị thả neo!'); SFX.anchor(); }
  else if (e.type === 'shieldBlock' && mine) { toast('🛡️ Khiên đã chặn đòn tấn công!'); SFX.shield(); }
  else if (e.type === 'shieldBlock' && e.from === teamId && isNav) { toast('🛡️ Đối thủ có khiên: đòn bị chặn'); }
  else if (mine && !isNav && ['boost', 'wind', 'shield', 'unlock'].includes(e.type)) {
    toast({ boost: '⚡ Hoa Tiêu kích hoạt Tốc Biến!', wind: '🌪 Gió Thuận đang thổi!', shield: '🛡️ Khiên đã bật!', unlock: '🔓 Đã phá băng!' }[e.type]); SFX.boost();
  } else if (e.type === 'correct' && mine && e.role !== role && !isNav && e.segment) { toast('🚣 Thuyền vừa tiến thêm 1 đoạn!'); }
});
socket.on('gameStart', () => { SFX.item(); toast('🏁 Bắt đầu!'); });
socket.on('kingStart', () => { SFX.king(); toast('👑 THUYỀN VƯƠNG! Cả bảng cùng một đề!', 3500); });
socket.on('kingQuestion', () => { $('ans').value = ''; });
socket.on('kingWin', (e) => { if (e.teamId === teamId) { SFX.victory(); toast('🎉 Đội bạn thắng Thuyền Vương!', 4000); } });
socket.on('gameOver', (r) => { if (r.winnerId === teamId) SFX.victory(); });
socket.on('lobby', () => { question = null; blockedUntil = 0; });

// ------------------------------------------------------------- bàn phím số
const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '-', '0', '.', ',', '/'];
$('keypad').innerHTML = KEYS.map((k) => `<button type="button" class="ghost" data-k="${k}">${k}</button>`).join('');
$('keypad').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k, a = $('ans');
  if (k === '⌫') a.value = a.value.slice(0, -1); else if (k === 'C') a.value = ''; else a.value += k;
});
$('ans').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
$('send').onclick = submit;

function submit() {
  if (!view || sending || $('send').disabled) return;
  const val = $('ans').value.trim();
  if (!val) return toast('Hãy nhập đáp án');
  sending = true;
  const done = () => { sending = false; render(); };
  if (view.phase === 'king') {
    socket.emit('king:answer', { answer: val }, (r) => {
      if (!r.ok) toast('❌ ' + r.error);
      else if (r.correct) { toast('🎉 CHÍNH XÁC! Đội bạn lao về đích!', 4000); SFX.correct(); }
      else { toast('❌ Đáp án chưa đúng. Đội bạn đã hết lượt cho câu này.', 3500); SFX.wrong(); }
      $('ans').value = ''; done();
    });
    return;
  }
  socket.emit('answer', { answer: val }, (r) => {
    if (!r.ok) {
      toast('⛔ ' + r.error);
      if (r.locked === 'block') blockedUntil = Date.now() + r.lockedMs;
    } else if (r.correct) {
      SFX.correct();
      toast(r.segment ? '✅ Đúng! +1 ⚡ +10 💰 — Thuyền tiến 1 đoạn!' : '✅ Đúng! +1 ⚡ +10 💰');
    } else {
      SFX.wrong(); blockedUntil = Date.now() + r.blockMs;
      toast(`❌ Sai rồi! Bị chặn ${Math.round(r.blockMs / 1000)} giây`, 2800);
    }
    $('ans').value = ''; done();
  });
}

// ------------------------------------------------------------- cửa hàng Hoa Tiêu
function buildShop() {
  shopBuilt = true;
  $('items').innerHTML = Object.entries(items).map(([k, it]) =>
    `<button type="button" class="item" data-item="${k}"><b>${it.icon} ${esc(it.name)}</b><span class="cost">💰 ${it.cost}</span><small>${esc(it.desc)}</small></button>`).join('');
  $('items').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const item = b.dataset.item;
    if (items[item].kind === 'attack' && !target) return toast('Hãy chọn đội đối thủ trước');
    socket.emit('buy', { item, target }, (r) => {
      if (!r.ok) { toast('❌ ' + r.error); SFX.wrong(); return; }
      SFX.item();
      toast(r.mystery ? `🎲 Hòm Bí Ẩn: ${r.icon} ${r.name}!` : `${r.icon} Đã dùng ${r.name}!`);
    });
  });
  $('rivals').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    target = Number(b.dataset.id); rivalSig = ''; render();
  });
}

// ------------------------------------------------------------- hiển thị
function show(id, on) { $(id).classList.toggle('hidden', !on); }

function render() {
  if (fatal || !view) return;
  const v = view, me = v.me, el = Date.now() - viewAt, ph = v.phase;
  const king = v.king;

  $('ptimer').textContent = ph === 'running' ? fmt(v.timeLeftMs - el) : ph === 'lobby' ? fmt(v.timeLeftMs) : ph === 'king' ? '👑' : '🏁';
  show('wait', ph === 'lobby');
  show('stats', ph === 'running' || ph === 'king');
  show('qsec', (!isNav && ph === 'running') || ph === 'king');
  show('shop', isNav && ph === 'running');
  show('over', ph === 'finished');

  if (ph === 'lobby') {
    $('waitInfo').innerHTML = `Bạn là <b>${esc(info.roleName)}</b> của <b>${esc(me.name)}</b>.<br>Thuyền có ${me.online}/4 Người Chèo và ${me.nav ? 'đã có' : 'chưa có'} Hoa Tiêu.`;
  }

  if (ph === 'running' || ph === 'king') {
    $('sRank').textContent = `${me.rank}/${v.teamCount}`;
    $('sEnergy').textContent = me.energy;
    $('sGold').textContent = me.gold;
    $('sBar').style.width = ((me.energy % 4) / 4) * 100 + '%';
    const eff = [];
    if (me.frozenMs - el > 0) eff.push('❄️ Đóng băng ' + Math.ceil((me.frozenMs - el) / 1000) + 's');
    if (me.boostMs - el > 0) eff.push('⚡ Tốc biến');
    if (me.windMs - el > 0) eff.push('🌪 Gió thuận');
    if (me.anchorMs - el > 0) eff.push('⚓ Bị neo');
    if (me.shield) eff.push('🛡️ Có khiên');
    $('effects').innerHTML = eff.map((x) => `<span>${x}</span>`).join('');
  }

  // ----- Người Chèo / Thuyền Vương
  if (!isNav && ph === 'running') {
    $('qlv').textContent = question ? 'Độ khó ' + '★'.repeat(question.level) : '';
    $('qtext').textContent = question ? question.text : 'Đang chờ câu hỏi…';
    show('answerBox', true); $('kingHint').textContent = 'Mỗi người chèo nhận một câu hỏi riêng. Đúng +1 ⚡, sai bị chặn 3–5 giây.';
    const fl = me.frozenMs - el, bl = blockedUntil - Date.now();
    const lock = $('lock');
    if (fl > 0) { lock.className = 'lock freeze'; lock.textContent = `❄️ Thuyền bị đóng băng ${Math.ceil(fl / 1000)}s`; }
    else if (bl > 0) { lock.className = 'lock'; lock.textContent = `⛔ Sai rồi! Chờ ${Math.ceil(bl / 1000)}s`; }
    else lock.className = 'lock hidden';
    $('send').disabled = fl > 0 || bl > 0 || !question || sending;
    $('send').textContent = 'Gửi đáp án';
  }
  if (ph === 'king' && king) {
    $('qlv').innerHTML = `<span class="king-tag">👑 THUYỀN VƯƠNG</span> Câu ${king.idx}/${king.total} · còn ${Math.ceil(Math.max(0, king.endsInMs - el) / 1000)}s`;
    $('qtext').textContent = king.text;
    show('answerBox', !isNav);
    const sent = king.answered.includes(teamId);
    const lock = $('lock');
    if (king.winnerId) { lock.className = 'lock'; lock.textContent = king.winnerId === teamId ? '🎉 ĐỘI BẠN THẮNG!' : '🏁 Đã có đội về đích'; }
    else if (sent && !isNav) { lock.className = 'lock'; lock.textContent = '✔ Đội bạn đã gửi đáp án. Chờ kết quả…'; }
    else lock.className = 'lock hidden';
    $('send').disabled = !!king.winnerId || sent || sending;
    $('send').textContent = 'Gửi đáp án của đội (chỉ 1 lần)';
    $('kingHint').textContent = isNav ? 'Thuyền Vương: thuyền đã dừng, vật phẩm bị khoá. Cùng thảo luận với 4 Người Chèo!' : 'Cả 4 Người Chèo thảo luận, rồi MỘT người gửi đáp án thay cả đội.';
  }

  // ----- Hoa Tiêu
  if (isNav && ph === 'running' && v.rivals) {
    if (!target || !v.rivals.some((r) => r.id === target)) {
      const ahead = v.rivals.find((r) => r.rank === me.rank - 1);
      target = (ahead || v.rivals[0] || {}).id || null;
    }
    const sig = JSON.stringify(v.rivals.map((r) => [r.id, Math.round(r.pct), r.frozen, r.anchored, r.shield])) + target;
    if (sig !== rivalSig) {
      rivalSig = sig;
      $('rivals').innerHTML = v.rivals.map((r) => `<button type="button" class="rival ${r.id === target ? 'sel' : ''}" style="--c:${r.color}" data-id="${r.id}">
        <span>${r.rank}</span><span>${esc(r.name)}</span><span>${Math.round(r.pct)}%${r.frozen ? ' ❄️' : ''}${r.anchored ? ' ⚓' : ''}${r.shield ? ' 🛡️' : ''}</span></button>`).join('')
        || '<div class="hint">Chưa có đội đối thủ.</div>';
    }
    $('items').querySelectorAll('button').forEach((b) => { b.disabled = me.gold < items[b.dataset.item].cost; });
  }

  if (ph === 'finished' && v.result) {
    const r = v.result, mineRank = (r.ranking.find((x) => x.id === teamId) || {}).rank;
    $('overTitle').textContent = r.winnerId === teamId ? '🏆 ĐỘI BẠN VÔ ĐỊCH!' : '🏁 Kết thúc trận đấu';
    $('overInfo').innerHTML = `Đội thắng: <b>${esc(r.winnerName)}</b><br>Đội bạn xếp hạng <b>${mineRank}/${v.teamCount}</b>`;
  }
}
setInterval(render, 250);
