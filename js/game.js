const gameCanvas = document.getElementById('game-canvas');
const ctx        = gameCanvas.getContext('2d');


const state = {
  imageIdx:          0,
  numColors:         6,
  paintStyle:        'watercolor',
  level:             'medium',

  palette:           [],
  selectedPaletteIdx: -1,
  mixSlots:          [null, null, null],
  _mixedColor:       null,

  colorMap:          [],    // original [row][col] = {r,g,b}
  pixelPainted:      {},    // "col,row" -> {r,g,b}

  pixelSize:         8,
  tool:              'pen', // 'pen' | 'brush' | 'fill'

  _isDrawing:        false,
};


function initGame() {
  const img      = IMAGES[state.imageIdx];
  const levelCfg = LEVELS[state.level];

  state.pixelSize    = levelCfg.pixelSize;
  state.colorMap     = generateImageColors(img.type, CANVAS_W, CANVAS_H);
  state.pixelPainted = {};
  state.selectedPaletteIdx = -1;
  state.mixSlots    = [null, null, null];
  state._mixedColor = null;
  state.palette     = generatePalette(state.colorMap, state.numColors, CANVAS_W, CANVAS_H);

  const pw = CANVAS_W * state.pixelSize;
  const ph = CANVAS_H * state.pixelSize;
  gameCanvas.width       = pw;
  gameCanvas.height      = ph;
  gameCanvas.style.width  = pw + 'px';
  gameCanvas.style.height = ph + 'px';

  _buildPeekOverlay();
}

function _buildPeekOverlay() {
  let overlay = document.getElementById('peek-overlay');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'peek-overlay';
    document.getElementById('canvas-wrapper').appendChild(overlay);

    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
  }
  
  overlay.width        = gameCanvas.width;
  overlay.height       = gameCanvas.height;
  overlay.style.width  = gameCanvas.style.width;
  overlay.style.height = gameCanvas.style.height;

  const oc = overlay.getContext('2d');
  oc.clearRect(0, 0, overlay.width, overlay.height);
  for (let row = 0; row < CANVAS_H; row++) {
    for (let col = 0; col < CANVAS_W; col++) {
      oc.fillStyle = rgbStr(state.colorMap[row][col]);
      oc.fillRect(col * state.pixelSize, row * state.pixelSize, state.pixelSize, state.pixelSize);
    }
  }
}

/* рендер */

function renderGame() {
  const { pixelPainted, pixelSize, paintStyle } = state;

  ctx.fillStyle = '#f9f5ee';
  ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Draw painted pixels
  for (const key in pixelPainted) {
    const [col, row] = key.split(',').map(Number);
    const c = pixelPainted[key];
    ctx.fillStyle = rgbStr(c);
    _drawPixelStyle(ctx, col * pixelSize, row * pixelSize, pixelSize, paintStyle);
  }

  _drawGrid();
  _updateProgress();
}

function _drawPixelStyle(cx, x, y, ps, style) {
  cx.fillRect(x, y, ps, ps);
  if (style === 'watercolor') {
    cx.fillStyle = 'rgba(255,255,255,0.07)';
    cx.fillRect(x + ps * 0.1, y + ps * 0.1, ps * 0.4, ps * 0.4);
  } else if (style === 'oil') {
    cx.fillStyle = 'rgba(255,255,255,0.09)';
    cx.fillRect(x, y, ps, ps * 0.28);
  }
}

function _drawGrid() {
  const { pixelSize } = state;
  // Only draw grid if pixels are large enough to see it
  if (pixelSize < 7) return;
  ctx.strokeStyle = 'rgba(180,170,155,0.25)';
  ctx.lineWidth   = 0.5;
  for (let c = 0; c <= CANVAS_W; c++) {
    ctx.beginPath(); ctx.moveTo(c * pixelSize, 0); ctx.lineTo(c * pixelSize, CANVAS_H * pixelSize); ctx.stroke();
  }
  for (let r = 0; r <= CANVAS_H; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * pixelSize); ctx.lineTo(CANVAS_W * pixelSize, r * pixelSize); ctx.stroke();
  }
}

function _updateProgress() {
  const total   = CANVAS_W * CANVAS_H;
  const painted = Object.keys(state.pixelPainted).length;
  document.getElementById('progress-info').textContent = `${Math.round(painted / total * 100)}% закрашено`;
}

/*рисование */

function paintPixel(col, row) {
  if (col < 0 || col >= CANVAS_W || row < 0 || row >= CANVAS_H) return;
  if (state.selectedPaletteIdx < 0) { showToast('Выберите цвет из палитры!'); return; }

  const color = state.palette[state.selectedPaletteIdx];

  if (state.tool === 'pen') {
    state.pixelPainted[`${col},${row}`] = { ...color };
  } else if (state.tool === 'brush') {
    // 3×3 brush
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nc = col + dc, nr = row + dr;
        if (nc >= 0 && nc < CANVAS_W && nr >= 0 && nr < CANVAS_H)
          state.pixelPainted[`${nc},${nr}`] = { ...color };
      }
  } else if (state.tool === 'fill') {
    _floodFill(col, row, color);
  }

  renderGame();
}

function _floodFill(startCol, startRow, fillColor) {
  const target = state.pixelPainted[`${startCol},${startRow}`];
  const targetKey = target ? `${target.r},${target.g},${target.b}` : 'empty';
  const fillKey   = `${fillColor.r},${fillColor.g},${fillColor.b}`;
  if (targetKey === fillKey) return;

  const queue = [[startCol, startRow]];
  const visited = new Set();

  while (queue.length) {
    const [c, r] = queue.shift();
    const k = `${c},${r}`;
    if (visited.has(k)) continue;
    if (c < 0 || c >= CANVAS_W || r < 0 || r >= CANVAS_H) continue;

    const cur = state.pixelPainted[k];
    const curKey = cur ? `${cur.r},${cur.g},${cur.b}` : 'empty';
    if (curKey !== targetKey) continue;

    visited.add(k);
    state.pixelPainted[k] = { ...fillColor };

    queue.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
}

/* мышь */

function _canvasCoords(e) {
  const rect   = gameCanvas.getBoundingClientRect();
  const scaleX = gameCanvas.width  / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    col: Math.floor((clientX - rect.left) * scaleX / state.pixelSize),
    row: Math.floor((clientY - rect.top)  * scaleY / state.pixelSize),
  };
}

gameCanvas.addEventListener('mousedown', e => {
  state._isDrawing = true;
  const { col, row } = _canvasCoords(e);
  paintPixel(col, row);
});

gameCanvas.addEventListener('mousemove', e => {
  if (!state._isDrawing) return;
  const { col, row } = _canvasCoords(e);
  paintPixel(col, row);
});

window.addEventListener('mouseup', () => { state._isDrawing = false; });

gameCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  state._isDrawing = true;
  const { col, row } = _canvasCoords(e);
  paintPixel(col, row);
}, { passive: false });

gameCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!state._isDrawing) return;
  const { col, row } = _canvasCoords(e);
  paintPixel(col, row);
}, { passive: false });

window.addEventListener('touchend', () => { state._isDrawing = false; });

/* подсчет */

function calculateResult() {
  const { pixelPainted, colorMap } = state;
  const total    = CANVAS_W * CANVAS_H;
  const painted  = Object.keys(pixelPainted);
  const coverage = painted.length / total;
  const maxDist  = Math.sqrt(3) * 255;

  let totalDist = 0;
  for (const key of painted) {
    const [col, row] = key.split(',').map(Number);
    totalDist += colorDistance(colorMap[row][col], pixelPainted[key]);
  }
  
  let avgDist  = painted.length ? totalDist / painted.length : maxDist;
  const accuracy = Math.max(0, 1 - avgDist / maxDist);

  totalDist += maxDist * (total - painted.length)
  avgDist  = painted.length ? totalDist / total : maxDist;
  const score = Math.max(0, 1 - avgDist / maxDist);
  return {
    accuracy: Math.round(accuracy * 100),
    coverage: Math.round(coverage * 100),
    total:    Math.round(score * 100),
    maxDist,
  };
}
