/* Âm thanh tạo bằng WebAudio: không cần file mp3, không lỗi 404.
   Trình duyệt chỉ cho phát tiếng sau khi người dùng chạm/bấm 1 lần. */
const SFX = (() => {
  let ctx = null, on = true, lastCorrect = 0;
  function ensure() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => document.addEventListener(e, ensure, { passive: true }));

  function tone(freq, dur = 0.15, type = 'sine', delay = 0, vol = 0.15) {
    if (!ctx || !on || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  return {
    enable() { on = true; return ensure(); },
    toggle() { on = !on; ensure(); return on; },
    isRunning() { return !!ctx && ctx.state === 'running' && on; },
    // Đúng: âm thanh tích cực
    correct() { const n = Date.now(); if (n - lastCorrect < 150) return; lastCorrect = n; tone(660, 0.09, 'triangle'); tone(880, 0.14, 'triangle', 0.09); },
    // Sai: âm thanh báo lỗi
    wrong() { tone(180, 0.22, 'sawtooth', 0, 0.12); tone(120, 0.3, 'sawtooth', 0.15, 0.12); },
    // Vật phẩm
    freeze() { tone(1600, 0.1); tone(1200, 0.18, 'sine', 0.08); tone(800, 0.3, 'sine', 0.18); },
    boost() { for (let i = 0; i < 7; i++) tone(280 + i * 110, 0.09, 'square', i * 0.045, 0.07); },
    shield() { tone(520, 0.18, 'triangle'); tone(780, 0.28, 'triangle', 0.1); },
    item() { tone(520, 0.08, 'triangle'); tone(700, 0.08, 'triangle', 0.07); tone(980, 0.16, 'triangle', 0.14); },
    anchor() { tone(110, 0.4, 'sawtooth', 0, 0.14); tone(70, 0.5, 'sine', 0.1, 0.2); },
    king() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', i * 0.11, 0.09)); },
    // Chiến thắng
    victory() { [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.13, 0.16)); },
    tick() { tone(900, 0.05, 'square', 0, 0.05); },
  };
})();
