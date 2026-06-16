// images.js
const CANVAS_W = 64;
const CANVAS_H = 64;

// Список изображений: тип (ключ), отображаемое имя, имя файла
const IMAGE_DEFS = [
  { type: 'sunset', name: 'Закат над горами', file: 'sunset.jpg' },
  { type: 'forest', name: 'Осенний лес',      file: 'forest.jpg' },
  { type: 'ocean',  name: 'Морской берег',    file: 'ocean.jpg'  },
  { type: 'city',   name: 'Ночной город',     file: 'city.jpg'   },
];

// Глобальный массив IMAGES (совместимость со старым кодом)
// Сначала предзагруженные, затем custom
const IMAGES = [
  ...IMAGE_DEFS.map(def => ({ name: def.name, type: def.type, colorMap: null })),
  { name: 'Моя картинка', type: 'custom', colorMap: null },
];

// Кэш цветовых карт по типу
const colorMapCache = new Map();

// Преобразует загруженное изображение в цветовую карту (без изменений)
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
            sr += data[i]; sg += data[i+1]; sb += data[i+2]; n++;
          }
        }
        r = sr / n; g = sg / n; b = sb / n;
      } else {
        let mr = 0, mg = 0, mb = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * sw + x) * 4;
            if (data[i] > mr) mr = data[i];
            if (data[i+1] > mg) mg = data[i+1];
            if (data[i+2] > mb) mb = data[i+2];
          }
        }
        r = mr; g = mg; b = mb;
      }
      map[row].push({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
    }
  }
  return map;
}

// Загружает одно изображение по его типу
async function loadImageForType(type, reduceMethod = 'max') {
  const def = IMAGE_DEFS.find(d => d.type === type);
  if (!def) throw new Error(`Неизвестный тип: ${type}`);
  if (colorMapCache.has(type)) return colorMapCache.get(type);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const colorMap = imageToColorMap(img, CANVAS_W, CANVAS_H, reduceMethod);
      colorMapCache.set(type, colorMap);
      resolve(colorMap);
    };
    img.onerror = () => reject(new Error(`Не удалось загрузить ${def.file}`));
    img.src = `/images/${def.file}`;
  });
}

// Предзагрузка всех изображений из папки images
async function preloadAllImages(reduceMethod = 'max') {
  const promises = IMAGE_DEFS.map(def => loadImageForType(def.type, reduceMethod));
  const maps = await Promise.all(promises);
  // Заполняем colorMap в глобальном массиве IMAGES
  for (let i = 0; i < IMAGE_DEFS.length; i++) {
    const type = IMAGE_DEFS[i].type;
    const index = IMAGES.findIndex(img => img.type === type);
    if (index !== -1) {
      IMAGES[index].colorMap = maps[i];
    }
  }
  console.log(`Загружено ${maps.length} изображений`);
}

// Генерация цветовой карты для заданного типа (используется в game.js)
function generateImageColors(type, w, h) {
  if (type === 'custom') {
    const customImg = IMAGES.find(im => im.type === 'custom');
    if (customImg && customImg.colorMap) return customImg.colorMap;
    // fallback для custom
    const fallback = [];
    for (let row = 0; row < h; row++) {
      fallback.push([]);
      for (let col = 0; col < w; col++) fallback[row].push({ r: 230, g: 225, b: 218 });
    }
    return fallback;
  }

  // Для предзагруженных типов
  const cached = colorMapCache.get(type);
  if (cached) return cached;
  const imgEntry = IMAGES.find(im => im.type === type);
  if (imgEntry && imgEntry.colorMap) return imgEntry.colorMap;

  // fallback (серый фон)
  console.warn(`Цветовая карта для ${type} не найдена, используется серый цвет`);
  const fallback = [];
  for (let row = 0; row < h; row++) {
    fallback.push([]);
    for (let col = 0; col < w; col++) fallback[row].push({ r: 200, g: 200, b: 200 });
  }
  return fallback;
}

// Экспорт глобальных переменных для других скриптов
window.CANVAS_W = CANVAS_W;
window.CANVAS_H = CANVAS_H;
window.IMAGES = IMAGES;
window.generateImageColors = generateImageColors;
window.imageToColorMap = imageToColorMap;
window.preloadAllImages = preloadAllImages;