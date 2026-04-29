
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

document.getElementById('start-btn').addEventListener('click', startNewGame);


function startNewGame() {

  initGame();
  startPreview();
}
