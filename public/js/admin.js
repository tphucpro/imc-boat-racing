const $ = (id) => document.getElementById(id);
const socket = io();
const ROLE_SHORT = { p1: 'Chèo 1', p2: 'Chèo 2', p3: 'Chèo 3', p4: 'Chèo 4', navigator: 'Hoa tiêu' };
const ROLE_LIST = ['p1', 'p2', 'p3', 'p4', 'navigator'];
const PHASES = { lobby: '🟢 Phòng chờ', running: '🏁 Đang đua', king: '👑 THUYỀN VƯƠNG', finished: '🏆 Đã kết thúc' };

let info = null, key = sessionStorage.getItem('imc_key') || '', authed = false;
let snap = null, snapAt = 0, qrShown = false, drawnTeams = 0;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

async function boot() {
  info = await (await fetch('/api/info')).json();
  if (info.localOnly) {
    $('localWarn').classList.remove('hidden');
    $('localWarn').innerHTML = '⚠️ <b>Bạn đang mở bằng địa chỉ nội bộ (' + esc(location.host) + ').</b> ' +
      'Điện thoại ở nơi khác sẽ không vào được. Hãy <b>deploy lên Internet</b> (Render/Railway/VPS - xem README.md) rồi mở trang này bằng link công khai; ' +
      'mã QR sẽ tự sinh từ link đó. ' + (info.qrBlocked ? 'Mã QR đang bị tắt ở chế độ này.' : '(Đang bật ALLOW_LOCAL_QR=1: chỉ dùng để thử nghiệm.)');
  }
  if (info.needKey) { $('gate').classList.remove('hidden'); if (key) login(key); } else login('');
}

function login(k) {
  socket.emit('admin:auth', { key: k }, (res) => {
    if (!res.ok) { $('gateErr').textContent = res.error; $('gate').classList.remove('hidden'); $('app').classList.add('hidden'); return; }
    authed = true; key = k; sessionStorage.setItem('imc_key', k);
    $('gate').classList.add('hidden'); $('app').classList.remove('hidden');
    fillForm(res.settings); onState(res.snapshot);
  });
}
socket.on('connect', () => { if (info && (authed || key)) login(key); }); // tự đăng nhập lại khi mất mạng
$('btnLogin').onclick = () => login($('key').value);
$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') login($('key').value); });

function fillForm(s) {
  $('teamCount').value = s.teamCount; $('minutes').value = s.minutes; $('track').value = s.track;
  $('questions').value = s.questionsText; $('king').value = s.kingText; $('names').value = s.teamNames;
}

// ---------- Thiết lập
$('btnSetup').onclick = () => {
  $('setupMsg').textContent = 'Đang lưu…';
  socket.emit('admin:setup', {
    teamCount: $('teamCount').value, minutes: $('minutes').value, track: $('track').value,
    questionsText: $('questions').value, kingText: $('king').value, teamNames: $('names').value,
  }, (r) => {
    const el = $('setupMsg');
    if (!r.ok) { el.style.color = '#ff9b9b'; el.textContent = '❌ ' + r.error; return; }
    el.style.color = '#8be9b5';
    el.textContent = `✅ Đã tạo ${r.settings.teamCount} đội, ${r.counts.questions} câu hỏi, ${r.counts.king} câu Thuyền Vương.` + (r.warnings.length ? ' ⚠️ ' + r.warnings.join(' | ') : '');
    drawnTeams = 0; if (qrShown) renderQR();
  });
};

// ---------- Điều khiển
const send = (ev) => socket.emit(ev, {}, (r) => { $('ctrlMsg').textContent = r && !r.ok ? '❌ ' + r.error : ''; });
$('btnStart').onclick = () => send('admin:start');
$('btnEnd').onclick = () => { if (confirm('Kết thúc trận ngay bây giờ?')) send('admin:end'); };
$('btnReset').onclick = () => { if (confirm('Làm lại: xoá điểm và đưa về phòng chờ?')) send('admin:reset'); };
$('btnCopy').onclick = async () => {
  const url = info.base + '/display.html';
  try { await navigator.clipboard.writeText(url); $('copyOk').textContent = 'Đã chép: ' + url; } catch { $('copyOk').textContent = url; }
};

// ---------- Trạng thái
socket.on('state', onState);
function onState(s) {
  snap = s; snapAt = Date.now();
  $('phaseText').textContent = PHASES[s.phase] || s.phase;
  $('btnStart').disabled = s.phase !== 'lobby';
  $('btnEnd').disabled = !(s.phase === 'running' || s.phase === 'king');
  $('btnSetup').disabled = s.phase === 'running' || s.phase === 'king';
  $('timeText').textContent = s.phase === 'running' ? fmt(s.timeLeftMs) : s.phase === 'lobby' ? fmt(s.durationMs) : '';
  const ranked = [...s.teams].sort((a, b) => a.rank - b.rank);
  $('teamRows').innerHTML = ranked.map((t) => `<tr>
    <td><span class="dot" style="--c:${t.color};background:${t.color}"></span>${esc(t.name)}</td><td>${t.rank}</td><td>${Math.round(t.pct)}%</td>
    <td>⚡${t.energy}</td><td>💰${t.gold}</td><td>${t.online}/4</td><td>${t.nav ? '✅' : '—'}</td></tr>`).join('');
  if (qrShown && drawnTeams !== s.teams.length) renderQR();
}
setInterval(() => { if (snap && snap.phase === 'running') $('timeText').textContent = fmt(snap.timeLeftMs - (Date.now() - snapAt)); }, 250);

// ---------- QR
$('btnQR').onclick = () => { qrShown = !qrShown; $('btnQR').textContent = qrShown ? 'Ẩn mã QR' : 'Hiện mã QR'; if (qrShown) renderQR(); else $('qrGrid').innerHTML = ''; };
$('btnPrint').onclick = () => { if (!qrShown) { qrShown = true; renderQR(); } setTimeout(() => window.print(), 600); };

function renderQR() {
  if (!snap) return;
  drawnTeams = snap.teams.length;
  const link = (t, r) => `${info.base}/play.html?team=${t.id}&role=${r}`;
  $('linkList').innerHTML = snap.teams.map((t) => `<p><b>${esc(t.name)}</b><br>` + ROLE_LIST.map((r) => `${ROLE_SHORT[r]}: ${link(t, r)}`).join('<br>') + '</p>').join('');
  if (info.qrBlocked) {
    $('qrGrid').innerHTML = '<div class="alert" style="grid-column:1/-1">Mã QR đang tắt vì địa chỉ hiện tại là localhost/IP nội bộ. Hãy deploy lên Internet và mở trang quản trị bằng link công khai. Bạn vẫn có thể mở các link trong mục "Danh sách link" để thử.</div>';
    return;
  }
  $('qrGrid').innerHTML = snap.teams.map((t) => `<div class="qr-team" style="--c:${t.color}"><h3>${esc(t.name)}</h3><div class="qr-roles">` +
    ROLE_LIST.map((r) => `<div><img loading="lazy" alt="QR ${ROLE_SHORT[r]} ${esc(t.name)}" src="/qr.png?team=${t.id}&role=${r}">${ROLE_SHORT[r]}</div>`).join('') +
    '</div></div>').join('');
}

boot();
