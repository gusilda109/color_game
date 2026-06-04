function initOptionGroup(groupId, stateKey, transform) {
  document.getElementById(groupId).addEventListener('click', e => {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    document.querySelectorAll(`#${groupId} .opt-btn`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state[stateKey] = transform ? transform(btn.dataset.val) : btn.dataset.val;
  });
}

initOptionGroup('img-opts',    'imageIdx',   v => Number(v));
initOptionGroup('colors-opts', 'numColors',  v => Number(v));
initOptionGroup('style-opts',  'paintStyle', null);

document.getElementById('custom-img-btn').addEventListener('click', () => {
  document.getElementById('custom-file-input').click();
});

document.getElementById('custom-file-input').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const method = state.poolMethod || 'max';
      const map    = imageToColorMap(img, CANVAS_W, CANVAS_H, method);

      const ci = IMAGES.find(im => im.type === 'custom');
      ci.colorMap = map;
      ci.name     = file.name.replace(/\.[^.]+$/, '') || 'Моя картинка';

      showToast('Картинка загружена и преобразована в 64×64!');
    };
    img.onerror = () => showToast('Не удалось загрузить изображение');
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);

  e.target.value = '';
});

document.getElementById('start-btn').addEventListener('click', startNewGame);


function startNewGame() {
  state.isDaily = false;
  const img = IMAGES[state.imageIdx];

  if (img && img.type === 'custom' && !img.colorMap) {
    showToast('Сначала загрузите свою картинку');
    document.getElementById('custom-file-input').click();
    return;
  }

  initGame();
  startPreview();
}