// main.js

// Инициализация групп опций (выбор картинки, количества цветов, стиля)
function initOptionGroup(groupId, stateKey, transform) {
  const container = document.getElementById(groupId);
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    document.querySelectorAll(`#${groupId} .opt-btn`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state[stateKey] = transform ? transform(btn.dataset.val) : btn.dataset.val;
  });
}

// Глобальная инициализация – запускается после полной загрузки страницы
(async function init() {
  // Дожидаемся, пока preloadAllImages (из images.js) загрузит все картинки
  if (typeof preloadAllImages === 'function') {
    try {
      await preloadAllImages();
      console.log('Все изображения загружены');
    } catch (err) {
      console.error('Ошибка загрузки изображений:', err);
      showToast('Не удалось загрузить картинки, попробуйте позже');
    }
  }

  // Теперь можно инициализировать опции
  initOptionGroup('img-opts',    'imageIdx',   v => Number(v));
  initOptionGroup('colors-opts', 'numColors',  v => Number(v));
  initOptionGroup('style-opts',  'paintStyle', null);

  // Выбор метода усреднения пикселей (оставлен для кастомной загрузки)
  const methodOpts = document.getElementById('pool-method');
  if (methodOpts) {
    methodOpts.addEventListener('click', e => {
      const btn = e.target.closest('.opt-btn');
      if (!btn) return;
      document.querySelectorAll('#pool-method .opt-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.poolMethod = btn.dataset.val;
    });
  }

  // Кнопка загрузки своей картинки
  const customBtn = document.getElementById('custom-img-btn');
  const fileInput = document.getElementById('custom-file-input');
  if (customBtn) {
    customBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const method = state.poolMethod || 'max';
          const map = imageToColorMap(img, CANVAS_W, CANVAS_H, method);

          const customImage = IMAGES.find(im => im.type === 'custom');
          customImage.colorMap = map;
          customImage.name = file.name.replace(/\.[^.]+$/, '') || 'Моя картинка';

          showToast('Картинка загружена и преобразована в 64×64!');
        };
        img.onerror = () => showToast('Не удалось загрузить изображение');
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // чтобы можно было загрузить тот же файл повторно
    });
  }

  // Кнопка «Начать игру»
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startNewGame);
  }

  // Функция старта новой игры (не daily)
  function startNewGame() {
    state.isDaily = false;
    const img = IMAGES[state.imageIdx];

    // Для кастомной картинки проверяем, загружена ли она
    if (img && img.type === 'custom' && !img.colorMap) {
      showToast('Сначала загрузите свою картинку');
      if (fileInput) fileInput.click();
      return;
    }

    initGame();
    startPreview();
  }

  // Если после предзагрузки пользователь уже авторизован, показываем стартовый экран
  // (но Auth.refresh вызывается в auth.js, здесь только UI)
})();