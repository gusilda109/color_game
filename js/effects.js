(function () {
  const PENALTY_PER_HINT = 5;

  function animateCount(el, to, suffix) {
    suffix = suffix || ''; const dur = 900, start = performance.now();
    function frame(t) { const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e) + suffix; if (p < 1) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }
  function animateScoreCards() {
    ['score-accuracy', 'score-coverage', 'score-total'].forEach(id => { const el = document.getElementById(id); if (!el) return; const m = String(el.textContent).match(/-?\d+/); if (m) animateCount(el, parseInt(m[0], 10), '%'); });
  }
  function animateStatCards() {
    const g = document.getElementById('stat-games'); if (g) { const n = parseInt(g.textContent, 10); if (!isNaN(n)) animateCount(g, n, ''); }
    ['stat-best', 'stat-avg'].forEach(id => { const el = document.getElementById(id); if (!el) return; const m = String(el.textContent).match(/-?\d+/); if (m) animateCount(el, parseInt(m[0], 10), '%'); });
  }

  let actx = null, soundOn = true, lastSound = 0;
  function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function blip(freq, dur, vol, type) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq; o.connect(g); g.connect(a.destination);
    const t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function soundBrush() { if (!soundOn) return; const now = Date.now(); if (now - lastSound < 45) return; lastSound = now; blip(150 + Math.random() * 50, 0.05, 0.04, 'triangle'); }
  function soundDing()  { if (!soundOn) return; blip(880, 0.16, 0.10, 'sine'); blip(1320, 0.16, 0.05, 'sine'); }

  function updateEyedropBadge() {
    const b = document.getElementById('tool-eyedrop'); if (!b) return;
    const n = state.hintsUsed || 0;
    b.innerHTML = n > 0 ? '💧 <span class="hint-count">' + n + '</span>' : '💧';
  }
  function popLastSwatch() {
    const slots = document.querySelectorAll('#palette-grid .palette-slot');
    const el = slots[slots.length - 1]; if (!el) return;
    el.classList.remove('swatch-pop'); void el.offsetWidth; el.classList.add('swatch-pop');
  }
  function pickColor(col, row) {
    if (col < 0 || col >= CANVAS_W || row < 0 || row >= CANVAS_H) return;
    const c = state.colorMap[row][col];
    state.palette.push({ r: c.r, g: c.g, b: c.b, mixed: false, hint: true });
    selectPaletteColor(state.palette.length - 1);
    state.hintsUsed = (state.hintsUsed || 0) + 1;
    updateEyedropBadge(); popLastSwatch(); selectTool('pen');
    soundDing();
    showToast(`Пипетка: цвет добавлен · −${PENALTY_PER_HINT}% к точности`);
  }

  if (typeof paintPixel === 'function') {
    const _prevPaint = paintPixel;
    paintPixel = function (col, row) {
      if (state.tool === 'eyedrop') { pickColor(col, row); return; }
      _prevPaint(col, row);
      if (state.selectedPaletteIdx >= 0 && col >= 0 && col < CANVAS_W && row >= 0 && row < CANVAS_H && state.tool !== 'fill') {
        const p = state.palette[state.selectedPaletteIdx], t = state.colorMap[row][col];
        const d = Math.sqrt((p.r - t.r) ** 2 + (p.g - t.g) ** 2 + (p.b - t.b) ** 2);
        if (d < 30) soundDing(); else soundBrush();
      }
    };
  }

  if (typeof initGame === 'function') {
    const _origInit = initGame;
    initGame = function () { _origInit.apply(this, arguments); state.hintsUsed = 0; updateEyedropBadge(); };
  }
  if (typeof calculateResult === 'function') {
    const _origCalc = calculateResult;
    calculateResult = function () {
      const r = _origCalc.apply(this, arguments);
      const hints = state.hintsUsed || 0, pen = hints * PENALTY_PER_HINT;
      r.hints = hints; r.penalty = pen;
      r.accuracy = Math.max(0, r.accuracy - pen); r.total = Math.max(0, r.total - pen);
      return r;
    };
  }

  if (typeof buildResultScreen === 'function') {
    const _b = buildResultScreen;
    buildResultScreen = function () {
      _b.apply(this, arguments); animateScoreCards();
      const h = state.hintsUsed || 0; const sub = document.getElementById('result-subtitle');
      if (sub) sub.textContent = h > 0 ? `Подсказок: ${h} · штраф −${h * PENALTY_PER_HINT}%` : 'Уровень завершён';
    };
  }
  if (typeof renderProfile === 'function') { const _p = renderProfile; renderProfile = function () { _p.apply(this, arguments); animateStatCards(); }; }
  if (typeof renderSharedResult === 'function') { const _r = renderSharedResult; renderSharedResult = function () { _r.apply(this, arguments); animateScoreCards(); }; }

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tool-eyedrop')?.addEventListener('click', () => selectTool('eyedrop'));
    document.getElementById('use-mix-btn')?.addEventListener('click', () => setTimeout(popLastSwatch, 0));
    const st = document.getElementById('sound-toggle');
    if (st) st.addEventListener('click', () => { soundOn = !soundOn; st.textContent = soundOn ? '🔊' : '🔇'; if (soundOn) soundDing(); });
    updateEyedropBadge();
  });

  window.animateCount = animateCount;
})();