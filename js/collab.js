(function () {
  const coop = { active: false, room: null, isHost: false, mode: 'coop', meId: null };
  let ws = null, lastCursor = 0;
  const cursors = new Map();
  let curCanvas = null, curCtx = null, cursorTrackAttached = false;
  let duelResults = [];

  const _origPaintPixel = paintPixel;
  paintPixel = function (col, row) {
    if (!coop.active || coop.mode !== 'coop') return _origPaintPixel(col, row);
    const before = new Map();
    for (const k in state.pixelPainted) { const c = state.pixelPainted[k]; before.set(k, c.r + ',' + c.g + ',' + c.b); }
    _origPaintPixel(col, row);
    const cells = [];
    for (const k in state.pixelPainted) { const c = state.pixelPainted[k]; const sig = c.r + ',' + c.g + ',' + c.b; if (before.get(k) !== sig) cells.push([k, c.r, c.g, c.b]); }
    if (cells.length) wsSend({ type: 'ops', cells });
  };

  function wsUrl() { return (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws'; }
  function wsSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function randId() { return Math.random().toString(36).slice(2, 8); }
  function myName() { return (window.Auth && Auth.user && Auth.user.username) ? Auth.user.username : 'игрок'; }

  function decodeColorMap(b64) {
    const a = b64ToBytes(b64); const m = []; let i = 0;
    for (let row = 0; row < CANVAS_H; row++) { const r = []; for (let col = 0; col < CANVAS_W; col++) r.push({ r: a[i++], g: a[i++], b: a[i++] }); m.push(r); }
    return m;
  }
  function paintedToCells() { const out = []; for (const k in state.pixelPainted) { const c = state.pixelPainted[k]; out.push([k, c.r, c.g, c.b]); } return out; }
  function applyCells(cells) { for (const c of cells) state.pixelPainted[c[0]] = { r: c[1], g: c[2], b: c[3] }; renderGame(); }

  function ensureCursorCanvas() {
    const wrap = document.getElementById('canvas-wrapper'); if (!wrap) return;
    if (!curCanvas) {
      curCanvas = document.createElement('canvas'); curCanvas.id = 'coop-cursors';
      curCanvas.style.position = 'absolute'; curCanvas.style.top = '0'; curCanvas.style.left = '0';
      curCanvas.style.pointerEvents = 'none'; curCanvas.style.zIndex = '5';
      wrap.appendChild(curCanvas); curCtx = curCanvas.getContext('2d');
    }
    if (curCanvas.width !== gameCanvas.width) { curCanvas.width = gameCanvas.width; curCanvas.height = gameCanvas.height; curCanvas.style.width = gameCanvas.style.width; curCanvas.style.height = gameCanvas.style.height; }
  }
  function drawCursors() {
    if (!curCtx) return; curCtx.clearRect(0, 0, curCanvas.width, curCanvas.height);
    const ps = state.pixelSize;
    for (const cur of cursors.values()) {
      const x = cur.col * ps, y = cur.row * ps;
      curCtx.strokeStyle = cur.color; curCtx.lineWidth = 2; curCtx.strokeRect(x - 1, y - 1, ps + 2, ps + 2);
      curCtx.font = '11px "DM Mono", monospace';
      const w = curCtx.measureText(cur.name).width + 8; let ly = y - 15; if (ly < 0) ly = y + ps + 3;
      curCtx.fillStyle = cur.color; curCtx.fillRect(x, ly, w, 14);
      curCtx.fillStyle = '#fff'; curCtx.fillText(cur.name, x + 4, ly + 11);
    }
  }
  function pruneCursors() { const now = Date.now(); let ch = false; for (const [id, c] of cursors) if (now - c.t > 4000) { cursors.delete(id); ch = true; } if (ch) drawCursors(); }
  setInterval(pruneCursors, 1500);
  function attachCursorTracking() {
    if (cursorTrackAttached) return; cursorTrackAttached = true;
    gameCanvas.addEventListener('mousemove', e => {
      if (!coop.active || coop.mode !== 'coop') return;
      const now = Date.now(); if (now - lastCursor < 55) return; lastCursor = now;
      const { col, row } = _canvasCoords(e); wsSend({ type: 'cursor', col, row });
    });
  }

  function setOnline(users) { const el = document.getElementById('coop-online'); if (el) el.textContent = '● ' + ((users || []).length) + ' онлайн'; }
  function setActiveUI(on) {
    const badge = document.getElementById('coop-online'); const btn = document.getElementById('coop-share-btn');
    if (badge) badge.style.display = on ? '' : 'none';
    if (btn) btn.textContent = on ? '🔗 Ссылка' : '👥 С другом';
  }

  function connect(onOpen) {
    if (ws) { try { ws.close(); } catch {} ws = null; }
    ws = new WebSocket(wsUrl());
    ws.onopen = onOpen;
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } handle(m); };
    ws.onclose = () => { const el = document.getElementById('coop-online'); if (el && coop.active) el.textContent = '● оффлайн'; };
  }

  function setupGameFromRef(ref) {
    const ci = IMAGES.find(im => im.type === 'custom') || IMAGES[IMAGES.length - 1];
    ci.colorMap = decodeColorMap(ref.colormap);
    ci.name = ref.name || 'Совместная картина';
    state.imageIdx = IMAGES.indexOf(ci);
    state.numColors = ref.numColors || 6;
    state.paintStyle = ref.paintStyle || 'watercolor';
    initGame();
  }

  function handle(m) {
    if (m.type === 'created') {
      coop.active = true; coop.meId = m.you; coop.mode = m.mode || 'coop';
      setActiveUI(true);
      showToast(coop.mode === 'duel'
        ? 'Дуэль создана! Нажмите «Ссылка», чтобы позвать соперника.'
        : 'Совместный режим включён! Нажмите «Ссылка», чтобы позвать друзей.');
    } else if (m.type === 'init') {
      if (coop.isHost) return;
      if (!m.ref) { showToast('Эта игра ещё не создана или закрыта.'); leave(); return; }
      coop.mode = m.mode || 'coop'; coop.meId = m.you;
      setupGameFromRef(m.ref);
      if (coop.mode === 'coop') (m.painted || []).forEach(c => { state.pixelPainted[c[0]] = { r: c[1], g: c[2], b: c[3] }; });
      duelResults = m.results || [];
      coop.active = true;
      startPreview();
      setOnline(m.users); setActiveUI(true);
      if (coop.mode === 'coop') attachCursorTracking();
    } else if (m.type === 'ops') {
      applyCells(m.cells); ensureCursorCanvas();
    } else if (m.type === 'cursor') {
      cursors.set(m.id, { name: m.name, color: m.color, col: m.col, row: m.row, t: Date.now() }); ensureCursorCanvas(); drawCursors();
    } else if (m.type === 'leave') {
      cursors.delete(m.id); drawCursors();
    } else if (m.type === 'users') {
      setOnline(m.users);
    } else if (m.type === 'clear') {
      state.pixelPainted = {}; renderGame();
    } else if (m.type === 'duel-update') {
      duelResults = m.results || [];
      const mine = duelResults.some(r => r.id === coop.meId);
      if (mine && duelResults.length >= 2) renderDuel(duelResults);
    }
  }

  function hostStart(mode) {
    coop.room = randId(); coop.isHost = true; coop.mode = mode;
    connect(() => wsSend({
      type: 'create', room: coop.room, name: myName(), mode,
      ref: { colormap: encodeColorMap(state.colorMap), name: IMAGES[state.imageIdx].name, numColors: state.numColors, paintStyle: state.paintStyle },
      painted: paintedToCells(),
    }));
    if (mode === 'coop') attachCursorTracking();
  }

  async function copyLink() {
    const url = location.origin + '/c/' + coop.room;
    try { await navigator.clipboard.writeText(url); showToast('Ссылка скопирована: ' + url); }
    catch { showToast(url); }
  }

  function leave() {
    coop.active = false; coop.isHost = false; coop.mode = 'coop';
    if (ws) { try { ws.close(); } catch {} ws = null; }
    cursors.clear(); if (curCtx) curCtx.clearRect(0, 0, curCanvas.width, curCanvas.height);
    setActiveUI(false);
  }

  function submitDuelResult() {
    const r = calculateResult();
    wsSend({ type: 'duel-result', name: myName(), accuracy: r.accuracy, total: r.total, painted: encodePainted(state.pixelPainted) });
  }

  function duelCanvas(scale) { const c = document.createElement('canvas'); c.width = CANVAS_W * scale; c.height = CANVAS_H * scale; c.style.width = '100%'; c.style.maxWidth = (CANVAS_W * scale) + 'px'; c.className = 'duel-canvas'; return c; }

  function drawWorkAndDiff(pc, dc, b64) {
    const S = 3, pa = b64ToBytes(b64 || ''), maxDist = Math.sqrt(255 * 255 * 3);
    const pctx = pc.getContext('2d'); pctx.fillStyle = '#f9f5ee'; pctx.fillRect(0, 0, pc.width, pc.height);
    const dctx = dc.getContext('2d');
    for (let row = 0; row < CANVAS_H; row++) for (let col = 0; col < CANVAS_W; col++) {
      const pi = (row * CANVAS_W + col) * 4, painted = pa[pi + 3] > 0;
      if (painted) { pctx.fillStyle = `rgb(${pa[pi]},${pa[pi+1]},${pa[pi+2]})`; pctx.fillRect(col * S, row * S, S, S); }
      let col2;
      if (!painted) col2 = '#95a5a6';
      else { const t = state.colorMap[row][col]; const dr = t.r - pa[pi], dg = t.g - pa[pi+1], db = t.b - pa[pi+2]; const d = Math.sqrt(dr*dr+dg*dg+db*db) / maxDist; col2 = d < 0.15 ? '#27ae60' : d < 0.35 ? '#f39c12' : '#e74c3c'; }
      dctx.fillStyle = col2; dctx.fillRect(col * S, row * S, S, S);
    }
  }

  function renderDuel(results) {
    showScreen('duel-screen');
    document.getElementById('duel-title').textContent = 'Дуэль · ' + (IMAGES[state.imageIdx] ? IMAGES[state.imageIdx].name : '');
    const grid = document.getElementById('duel-grid'); grid.innerHTML = '';

    let best = -1, bestId = null, tie = false;
    results.forEach(r => { if (r.total > best) { best = r.total; bestId = r.id; tie = false; } else if (r.total === best) tie = true; });

    results.slice().sort((a, b) => b.total - a.total).forEach(r => {
      const card = document.createElement('div');
      card.className = 'duel-player' + (r.id === bestId && !tie ? ' winner' : '');
      const name = document.createElement('div'); name.className = 'duel-name';
      name.textContent = (r.id === coop.meId ? 'Вы' : r.name) + (r.id === bestId && !tie ? ' 👑' : '');
      card.appendChild(name);
      const cans = document.createElement('div'); cans.className = 'duel-cans';
      const pc = duelCanvas(3), dc = duelCanvas(3);
      drawWorkAndDiff(pc, dc, r.painted);
      cans.appendChild(blockOf('Работа', pc)); cans.appendChild(blockOf('Разница', dc));
      card.appendChild(cans);
      const sc = document.createElement('div'); sc.className = 'duel-scores';
      sc.innerHTML = `<span>Точность <b>${r.accuracy}%</b></span><span>Балл <b>${r.total}%</b></span>`;
      card.appendChild(sc);
      grid.appendChild(card);
    });

    const win = document.getElementById('duel-winner');
    if (tie) win.textContent = 'Ничья!';
    else { const w = results.find(r => r.id === bestId); win.textContent = 'Победитель: ' + (w.id === coop.meId ? 'вы' : w.name) + ' · ' + best + '%'; }
  }
  function blockOf(label, canvas) {
    const b = document.createElement('div'); b.className = 'duel-cblock';
    const l = document.createElement('div'); l.className = 'result-canvas-label'; l.textContent = label;
    b.appendChild(l); b.appendChild(canvas); return b;
  }

  function openModal()  { const m = document.getElementById('coop-modal'); if (m) m.style.display = 'flex'; }
  function closeModal() { const m = document.getElementById('coop-modal'); if (m) m.style.display = 'none'; }

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('coop-share-btn')?.addEventListener('click', () => { if (coop.active) copyLink(); else openModal(); });
    document.getElementById('coop-confirm-coop')?.addEventListener('click', () => { closeModal(); hostStart('coop'); });
    document.getElementById('coop-confirm-duel')?.addEventListener('click', () => { closeModal(); hostStart('duel'); });
    document.getElementById('coop-cancel')?.addEventListener('click', closeModal);
    document.getElementById('coop-modal')?.addEventListener('click', e => { if (e.target.id === 'coop-modal') closeModal(); });

    document.getElementById('finish-btn')?.addEventListener('click', () => {
      if (coop.active && coop.mode === 'duel') {
        submitDuelResult();
        const sub = document.getElementById('result-subtitle'); if (sub) sub.textContent = 'Ждём соперника…';
      }
    });

    document.getElementById('duel-menu')?.addEventListener('click', () => { leave(); showScreen(window.Auth && Auth.user ? 'start-screen' : 'auth-screen'); });
    document.getElementById('duel-share')?.addEventListener('click', copyLink);

    ['menu-btn', 'retry-btn', 'next-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { if (coop.active) leave(); }));

    document.getElementById('clear-btn')?.addEventListener('click', e => {
      if (!coop.active || coop.mode !== 'coop') return;
      e.stopImmediatePropagation();
      if (confirm('Стереть холст у всех игроков?')) { state.pixelPainted = {}; renderGame(); wsSend({ type: 'clear' }); }
    }, true);
  });

  window.openCollab = function (room) {
    coop.room = (room || 'room').replace(/[^A-Za-z0-9_-]/g, '') || 'room';
    coop.isHost = false;
    showToast('Подключаемся к игре…');
    connect(() => wsSend({ type: 'join', room: coop.room, name: myName() }));
  };
})();