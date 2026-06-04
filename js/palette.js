function rgbStr(c) {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function mixColors(colors) {
  if (!colors.length) return { r: 200, g: 200, b: 200 };

  let result = [colors[0].r, colors[0].g, colors[0].b];

  for (let i = 1; i < colors.length; i++) {
    const c = colors[i];
    result = mixbox.lerp(result, [c.r, c.g, c.b], 1 / (i + 1));
  }

  return {
    r: Math.round(result[0]),
    g: Math.round(result[1]),
    b: Math.round(result[2]),
  };
}


const BASE_PALETTE = [
  { r: 220, g: 20,  b: 20,  mixed: false },
  { r: 255, g: 220, b: 0,   mixed: false },
  { r: 30,  g: 60,  b: 220, mixed: false },
  { r: 0,   g: 180, b: 40,  mixed: false },
  { r: 200, g: 50,  b: 200, mixed: false },
  { r: 255, g: 140, b: 0,   mixed: false },
  { r: 139, g: 69,  b: 19,  mixed: false },
  { r: 50,  g: 50,  b: 50,  mixed: false },
  { r: 220, g: 220, b: 220, mixed: false },
  { r: 255, g: 100, b: 180, mixed: false },
  { r: 0,   g: 200, b: 200, mixed: false },
  { r: 100, g: 50,  b: 0,   mixed: false },
];

function generatePalette(colorMap, numColors, w, h) {     
  const palette = [];

  for (let i = 0; i < numColors && i < BASE_PALETTE.length; i++) {
    palette.push({ ...BASE_PALETTE[i] });
  }

  return palette;
}