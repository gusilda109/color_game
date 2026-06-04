function showToast(msg, duration = 2200) {
  const t = document.getElementById('toaster');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let _previewTimer = null;

function startPreview() {
  const img = IMAGES[state.imageIdx];

  const pc  = document.getElementById('preview-canvas');
  const displaySize = 6;
  pc.width  = CANVAS_W * displaySize;
  pc.height = CANVAS_H * displaySize;
  pc.style.width  = (CANVAS_W * displaySize) + 'px';
  pc.style.height = (CANVAS_H * displaySize) + 'px';

  const pcx = pc.getContext('2d');
  for (let row = 0; row < CANVAS_H; row++) {
    for (let col = 0; col < CANVAS_W; col++) {
      pcx.fillStyle = rgbStr(state.colorMap[row][col]);
      pcx.fillRect(col * displaySize, row * displaySize, displaySize, displaySize);
    }
  }

  document.getElementById('preview-title').textContent = img.name;

  let seconds = 15;
  const timerEl = document.getElementById('preview-timer');
  timerEl.textContent = seconds;
  timerEl.classList.remove('urgent');

  clearInterval(_previewTimer);
  _previewTimer = setInterval(() => {
    seconds--;
    timerEl.textContent = seconds;
    if (seconds <= 5) timerEl.classList.add('urgent');
    if (seconds <= 0) {
      clearInterval(_previewTimer);
      _launchGame();
    }
  }, 1000);

  showScreen('preview-screen');
}

document.getElementById('preview-ready-btn').addEventListener('click', () => {
  clearInterval(_previewTimer);
  _launchGame();
});

function _launchGame() {
  const img = IMAGES[state.imageIdx];
  document.getElementById('canvas-title').textContent = img.name;
  document.getElementById('selected-swatch').style.background = '#ccc';
  document.getElementById('selected-label').textContent = 'Выберите цвет';

  renderPalette();
  renderMixSlots();
  renderGame();
  showScreen('game-screen');
}

document.getElementById('tool-pen').addEventListener('click', () => selectTool('pen'));
document.getElementById('tool-brush').addEventListener('click', () => selectTool('brush'));
document.getElementById('tool-fill').addEventListener('click', () => selectTool('fill'));

function selectTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tool-${tool}`).classList.add('active');
}

let _peekTimeout = null;

document.getElementById('peek-btn').addEventListener('mousedown', () => {
  const overlay = document.getElementById('peek-overlay');
  if (overlay) overlay.classList.add('visible');
});

document.getElementById('peek-btn').addEventListener('mouseup', () => {
  const overlay = document.getElementById('peek-overlay');
  if (overlay) overlay.classList.remove('visible');
});

document.getElementById('peek-btn').addEventListener('mouseleave', () => {
  const overlay = document.getElementById('peek-overlay');
  if (overlay) overlay.classList.remove('visible');
});

function renderPalette() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';
  state.palette.forEach((c, i) => {
    const slot = document.createElement('div');
    slot.className = 'palette-slot' + (i === state.selectedPaletteIdx ? ' active' : '');
    slot.style.background = rgbStr(c);
    slot.title = c.mixed ? 'Смешанный цвет' : `Цвет ${i + 1}`;
    slot.addEventListener('click', () => selectPaletteColor(i));
    grid.appendChild(slot);
  });
}

function selectPaletteColor(idx) {
  state.selectedPaletteIdx = idx;
  const c = state.palette[idx];
  document.getElementById('selected-swatch').style.background = rgbStr(c);
  document.getElementById('selected-label').textContent = `rgb(${c.r}, ${c.g}, ${c.b})`;
  renderPalette();
}

function renderMixSlots() {
  document.querySelectorAll('.mix-slot').forEach((el, i) => {
    const pidx = state.mixSlots[i];
    if (pidx !== null && state.palette[pidx]) {
      el.style.background  = rgbStr(state.palette[pidx]);
      el.style.borderStyle = 'solid';
      let xEl = el.querySelector('.remove-x');
      if (!xEl) {
        xEl = document.createElement('div');
        xEl.className = 'remove-x';
        xEl.textContent = '×';
        el.appendChild(xEl);
      }
      xEl.onclick = e => { e.stopPropagation(); state.mixSlots[i] = null; renderMixSlots(); };
    } else {
      el.style.background  = '';
      el.style.borderStyle = 'dashed';
      el.querySelector('.remove-x')?.remove();
    }
  });

  const active = state.mixSlots.filter(i => i !== null).map(i => state.palette[i]);
  const mixed  = active.length ? mixColors(active) : { r: 200, g: 200, b: 200 };
  document.getElementById('mix-result').style.background = rgbStr(mixed);
  state._mixedColor = active.length ? mixed : null;
}

document.querySelectorAll('.mix-slot').forEach((el, i) => {
  el.addEventListener('click', () => {
    if (state.selectedPaletteIdx >= 0) {
      state.mixSlots[i] = state.selectedPaletteIdx;
      renderMixSlots();
    } else {
      showToast('Сначала выберите цвет из палитры');
    }
  });
});

document.getElementById('use-mix-btn').addEventListener('click', () => {
  if (!state._mixedColor) { showToast('Добавьте цвета для смешивания!'); return; }
  state.palette.push({ ...state._mixedColor, mixed: true });
  selectPaletteColor(state.palette.length - 1);
  state.mixSlots    = [null, null, null];
  state._mixedColor = null;
  renderMixSlots();
  renderPalette();
  showToast('Смешанный цвет добавлен в палитру!');
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (confirm('Стереть всё и начать заново?')) {
    state.pixelPainted = {};
    renderGame();
    showToast('Холст очищен');
  }
});

document.getElementById('finish-btn').addEventListener('click', () => {
  buildResultScreen();
  showScreen('result-screen');
});

window.addEventListener('keydown', e => {
  if (e.code !== 'KeyM' || e.repeat) return;
  const overlay = document.getElementById('peek-overlay');
  if (overlay) overlay.classList.add('visible');
});

window.addEventListener('keyup', e => {
  if (e.code !== 'KeyM') return;
  const overlay = document.getElementById('peek-overlay');
  if (overlay) overlay.classList.remove('visible');
});


function buildResultScreen() {
  const img    = IMAGES[state.imageIdx];
  const result = calculateResult();
  saveScore(result, IMAGES[state.imageIdx].name, state.paintStyle);
  const { colorMap, pixelPainted } = state;

  document.getElementById('result-title').textContent =
    result.accuracy >= 70 ? `Отлично! ${img.name}` :
    result.accuracy >= 45 ? 'Хорошая работа!'       : 'Продолжайте практиковаться!';

  const grade = result.accuracy >= 70 ? 'great' : result.accuracy >= 45 ? 'good' : 'poor';

  const accEl = document.getElementById('score-accuracy');
  accEl.textContent = result.accuracy + '%';
  accEl.className   = 'score-number ' + grade;
  document.getElementById('score-coverage').textContent = result.coverage + '%';
  const totEl = document.getElementById('score-total');
  totEl.textContent = result.total + '%';
  totEl.className   = 'score-number ' + grade;

  const scale = 4;
  const rw = CANVAS_W * scale, rh = CANVAS_H * scale;

  function setup(id) {
    const c = document.getElementById(id);
    c.width = rw; c.height = rh;
    c.style.width = rw + 'px'; c.style.height = rh + 'px';
    return c.getContext('2d');
  }

  const oc = setup('result-original');
  for (let row = 0; row < CANVAS_H; row++)
    for (let col = 0; col < CANVAS_W; col++) {
      oc.fillStyle = rgbStr(colorMap[row][col]);
      oc.fillRect(col * scale, row * scale, scale, scale);
    }

  const pc = setup('result-painted');
  pc.fillStyle = '#f9f5ee';
  pc.fillRect(0, 0, rw, rh);
  for (const key in pixelPainted) {
    const [col, row] = key.split(',').map(Number);
    pc.fillStyle = rgbStr(pixelPainted[key]);
    pc.fillRect(col * scale, row * scale, scale, scale);
  }

  const dc = setup('result-diff');
  const maxDist = result.maxDist;
  for (let row = 0; row < CANVAS_H; row++)
    for (let col = 0; col < CANVAS_W; col++) {
      const key = `${col},${row}`;
      const p   = pixelPainted[key];
      let c;
      if (!p) {
        c = '#95a5a6';
      } else {
        const dist = colorDistance(colorMap[row][col], p) / maxDist;
        c = dist < 0.15 ? '#27ae60' : dist < 0.35 ? '#f39c12' : '#e74c3c';
      }
      dc.fillStyle = c;
      dc.fillRect(col * scale, row * scale, scale, scale);
    }
}

document.getElementById('retry-btn').addEventListener('click', () => {
  startNewGame();
});

document.getElementById('menu-btn').addEventListener('click', () => {
  showScreen('start-screen');
});

document.getElementById('next-btn').addEventListener('click', () => {
  let next = (state.imageIdx + 1) % IMAGES.length;
  if (IMAGES[next].type === 'custom' && !IMAGES[next].colorMap) {
    next = (next + 1) % IMAGES.length;
  }
  state.imageIdx = next;
  startNewGame();
});