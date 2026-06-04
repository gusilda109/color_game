const CANVAS_W = 64;
const CANVAS_H = 64;

const IMAGES = [
  { name: 'Закат над горами', type: 'sunset' },
  { name: 'Осенний лес',      type: 'forest' },
  { name: 'Морской берег',    type: 'ocean'  },
  { name: 'Ночной город',     type: 'city'   },
  { name: 'Моя картинка',     type: 'custom', colorMap: null },
];

function generateImageColors(type, w, h) {
  if (type === 'custom') {
    const ci = IMAGES.find(im => im.type === 'custom');
    if (ci && ci.colorMap) return ci.colorMap;
    const fallback = [];
    for (let row = 0; row < h; row++) {
      fallback.push([]);
      for (let col = 0; col < w; col++) fallback[row].push({ r: 230, g: 225, b: 218 });
    }
    return fallback;
  }

  const map = [];
  for (let row = 0; row < h; row++) {
    map.push([]);
    for (let col = 0; col < w; col++) {
      map[row].push(getPixelColor(type, col, row, w, h));
    }
  }
  return map;
}

function imageToColorMap(imgEl, targetW, targetH, reduce = 'max') {
  const maxSide = 512;
  let sw = imgEl.naturalWidth  || imgEl.width;
  let sh = imgEl.naturalHeight || imgEl.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  sw = Math.max(1, Math.round(sw * scale));
  sh = Math.max(1, Math.round(sh * scale));

  const tmp  = document.createElement('canvas');
  tmp.width  = sw;
  tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.fillStyle = '#f9f5ee';
  tctx.fillRect(0, 0, sw, sh);
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(imgEl, 0, 0, sw, sh);

  const data = tctx.getImageData(0, 0, sw, sh).data;

  const map = [];
  for (let row = 0; row < targetH; row++) {
    map.push([]);
    for (let col = 0; col < targetW; col++) {
      const x0 = Math.floor(col * sw / targetW);
      const x1 = Math.max(x0 + 1, Math.floor((col + 1) * sw / targetW));
      const y0 = Math.floor(row * sh / targetH);
      const y1 = Math.max(y0 + 1, Math.floor((row + 1) * sh / targetH));

      let r, g, b;
      if (reduce === 'avg') {
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * sw + x) * 4;
            sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
          }
        }
        r = sr / n; g = sg / n; b = sb / n;
      } else {
        let mr = 0, mg = 0, mb = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * sw + x) * 4;
            if (data[i]     > mr) mr = data[i];
            if (data[i + 1] > mg) mg = data[i + 1];
            if (data[i + 2] > mb) mb = data[i + 2];
          }
        }
        r = mr; g = mg; b = mb;
      }

      map[row].push({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
    }
  }
  return map;
}

function getPixelColor(type, col, row, w, h) {
  const nx = col / w, ny = row / h;
  switch (type) {
    case 'sunset': return _sunset(nx, ny);
    case 'forest': return _forest(nx, ny, col, row);
    case 'ocean':  return _ocean(nx, ny, col, row);
    case 'city':   return _city(nx, ny, col, row);
    default:       return { r: 200, g: 200, b: 200 };
  }
}

function _sunset(nx, ny) {
  const sunX = 0.58, sunY = 0.38;
  const d = Math.sqrt((nx - sunX) ** 2 + (ny - sunY) ** 2);

  const ridge1 = 0.52 + 0.20 * Math.sin(nx * Math.PI * 2.2 + 0.3);
  const ridge2 = 0.58 + 0.14 * Math.sin(nx * Math.PI * 3.8 + 1.1);
  const mTop = Math.min(ridge1, ridge2);

  if (ny > mTop) {
    const depth = (ny - mTop) / (1 - mTop);
    return lerp3([60, 35, 25], [30, 18, 12], [15, 8, 5], depth);
  }

  if (d < 0.04) return { r: 255, g: 235, b: 100 };
  if (d < 0.09) return lerp3([255, 210, 70], [255, 170, 50], [250, 130, 30], (d - 0.04) / 0.05);
  if (d < 0.18) return lerp3([245, 120, 40], [220, 90, 35], [200, 70, 30], (d - 0.09) / 0.09);

  if (ny > 0.55) return lerp3([220, 110, 50], [195, 80, 40], [170, 60, 35], (ny - 0.55) / 0.45);
  if (ny > 0.3)  return lerp3([190, 75, 100], [160, 55, 85], [130, 40, 70], (ny - 0.3) / 0.25);
  return lerp3([120, 50, 90], [90, 35, 75], [60, 20, 55], ny / 0.3);
}

function _forest(nx, ny, col, row) {
  if (ny < 0.28) {
    return lerp3([95, 155, 215], [135, 185, 235], [175, 210, 245], ny / 0.28);
  }

  const treeFreq = nx * Math.PI * 8;
  const treeH = 0.28 + 0.22 * Math.abs(Math.sin(treeFreq)) + 0.06 * Math.abs(Math.sin(treeFreq * 2.3));
  const inTree = ny < treeH;

  if (inTree) {
    const layer = Math.floor(nx * 10) % 3;
    const baseG = [70, 95, 55][layer];
    const baseR = [20, 35, 18][layer];
    const t = (ny - 0.28) / (treeH - 0.28);
    return lerp3([baseR + 20, baseG + 30, baseR], [baseR + 5, baseG + 5, baseR - 5], [baseR, baseG - 15, baseR - 10], t);
  }

  const t = (ny - treeH) / (1 - treeH);
  return lerp3([95, 75, 35], [75, 55, 25], [55, 40, 18], t);
}

function _ocean(nx, ny, col, row) {
  if (ny < 0.42) {
    const distH = Math.abs(ny - 0.42) / 0.42;
    if (ny > 0.35) return lerp3([255, 245, 190], [230, 200, 140], [200, 160, 100], (ny - 0.35) / 0.07);
    return lerp3([80, 145, 215], [110, 170, 230], [160, 200, 245], ny / 0.35);
  }

  if (ny < 0.44) return { r: 255, g: 248, b: 195 };

  const wave = Math.sin(nx * Math.PI * 10 + ny * 15) * 0.04 + Math.sin(nx * Math.PI * 5 + ny * 8 + 1.2) * 0.02;
  const depth = (ny - 0.44) / 0.56;
  const base = lerp3([35, 110, 185], [20, 75, 150], [8, 42, 105], depth);
  if (wave > 0.04) {
    return lerp3([base.r, base.g, base.b], [180, 220, 240], [255, 255, 255], (wave - 0.04) / 0.02);
  }
  return base;
}

function _city(nx, ny, col, row) {
  if (ny < 0.48) {
    const hash = Math.sin(col * 127.1 + row * 311.7) * 43758.5;
    const star = (hash - Math.floor(hash)) > 0.97;
    const skyBase = lerp3([5, 8, 28], [10, 14, 38], [15, 20, 48], ny / 0.48);
    if (star) return { r: Math.min(255, skyBase.r + 180), g: Math.min(255, skyBase.g + 180), b: Math.min(255, skyBase.b + 160) };
    return skyBase;
  }

  const bId   = Math.floor(nx * 14);
  const bHash = Math.sin(bId * 45.3) * 0.5 + 0.5;
  const bH    = 0.25 + bHash * 0.30;
  const bTop  = 1.0 - bH;

  if (ny > bTop) {
    const relX = (nx * 14) % 1;
    const relY = (ny - bTop) / bH;

    const winCol = Math.floor(relX * 8);
    const winRow = Math.floor(relY * 16);
    const litHash = Math.sin(bId * 7.1 + winCol * 3.7 + winRow * 5.3) * 0.5 + 0.5;
    const lit = winCol % 2 === 0 && winRow % 2 === 0 && litHash > 0.4;

    if (lit) return lerp3([255, 235, 150], [240, 200, 100], [220, 170, 60], litHash);
    return lerp3([18, 18, 32], [25, 25, 45], [22, 22, 38], relY);
  }

  return lerp3([20, 15, 25], [35, 25, 40], [28, 20, 32], (ny - 0.48) / 0.52);
}

function lerp3(c1, c2, c3, t) {
  t = Math.max(0, Math.min(1, isNaN(t) ? 0 : t));
  let r, g, b;
  if (t < 0.5) {
    const f = t * 2;
    r = c1[0] + (c2[0] - c1[0]) * f;
    g = c1[1] + (c2[1] - c1[1]) * f;
    b = c1[2] + (c2[2] - c1[2]) * f;
  } else {
    const f = (t - 0.5) * 2;
    r = c2[0] + (c3[0] - c2[0]) * f;
    g = c2[1] + (c3[1] - c2[1]) * f;
    b = c2[2] + (c3[2] - c2[2]) * f;
  }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}