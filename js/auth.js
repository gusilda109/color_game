
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка сети');
  return data;
}

const Auth = {
  user: null,
  async refresh() { this.user = (await api('/api/me')).user; return this.user; },
  async register(u, p) { this.user = (await api('/api/register', { method: 'POST', body: { username: u, password: p } })).user; },
  async login(u, p)    { this.user = (await api('/api/login',    { method: 'POST', body: { username: u, password: p } })).user; },
  async logout()       { await api('/api/logout', { method: 'POST' }); this.user = null; },
};

function bytesToB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function b64ToBytes(b64)  { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function encodeColorMap(colorMap) {
  const a = new Uint8Array(CANVAS_W * CANVAS_H * 3); let i = 0;
  for (let row = 0; row < CANVAS_H; row++)
    for (let col = 0; col < CANVAS_W; col++) { const c = colorMap[row][col]; a[i++] = c.r; a[i++] = c.g; a[i++] = c.b; }
  return bytesToB64(a);
}
function encodePainted(painted) {
  const a = new Uint8Array(CANVAS_W * CANVAS_H * 4);
  for (const key in painted) {
    const [col, row] = key.split(',').map(Number);
    const c = painted[key]; const idx = (row * CANVAS_W + col) * 4;
    a[idx] = c.r; a[idx + 1] = c.g; a[idx + 2] = c.b; a[idx + 3] = 255;
  }
  return bytesToB64(a);
}

async function saveScore(result, imageName, style) {
  const shareBtn = document.getElementById('result-share');
  if (!Auth.user) { if (shareBtn) shareBtn.style.display = 'none'; return; }
  try {
    const resp = await api('/api/scores', { method: 'POST', body: {
      image: imageName, style,
      accuracy: result.accuracy, coverage: result.coverage, total: result.total,
      colormap: encodeColorMap(state.colorMap),
      painted:  encodePainted(state.pixelPainted),
      daily: !!state.isDaily,
    }});
    if (shareBtn && resp.token) {
      shareBtn.style.display = '';
      shareBtn.onclick = async () => {
        const url = location.origin + '/r/' + resp.token;
        try { await navigator.clipboard.writeText(url); showToast('Ссылка на результат скопирована'); }
        catch { showToast(url); }
      };
    }
  } catch (e) { if (shareBtn) shareBtn.style.display = 'none'; }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleDateString('ru-RU');
}

const ACHIEVEMENTS = [
  { id:'first',  icon:'🎨', title:'Первый мазок',  desc:'Завершить первую игру', test:a=>(a.games||0) >= 1 },
  { id:'ten',    icon:'🔥', title:'Разогрелся',    desc:'Сыграть 10 игр',        test:a=>(a.games||0) >= 10 },
  { id:'reg',    icon:'🏅', title:'Завсегдатай',   desc:'Сыграть 25 игр',        test:a=>(a.games||0) >= 25 },
  { id:'acc50',  icon:'🎯', title:'Меткий глаз',   desc:'Точность 50% и выше',   test:a=>(a.maxAccuracy||0) >= 50 },
  { id:'acc80',  icon:'💯', title:'Снайпер',       desc:'Точность 80% и выше',   test:a=>(a.maxAccuracy||0) >= 80 },
  { id:'cover',  icon:'🖼️', title:'Холст закрашен',desc:'Покрытие 90% и выше',   test:a=>(a.maxCoverage||0) >= 90 },
  { id:'daily',  icon:'🗓️', title:'Картина дня',   desc:'Сыграть картину дня',   test:a=>(a.dailyGames||0) >= 1 },
];

function renderAchievements(a) {
  const box = document.getElementById('profile-achievements');
  if (!box) return;
  a = a || {};
  box.innerHTML = '';
  ACHIEVEMENTS.forEach(ac => {
    const got = !!ac.test(a);
    const el = document.createElement('div');
    el.className = 'ach' + (got ? ' got' : '');
    el.title = ac.desc + (got ? ' — получено' : ' — пока нет');
    el.innerHTML = `<span class="ach-ico">${ac.icon}</span><span class="ach-title">${escapeHtml(ac.title)}</span>`;
    box.appendChild(el);
  });
}

function renderProfile(data, { isPublic } = {}) {
  document.getElementById('profile-name').textContent  = data.user.username;
  document.getElementById('profile-since').textContent = 'на Chromix с ' + fmtDate(data.user.created_at);

  const s = data.stats || {};
  document.getElementById('stat-games').textContent = s.games || 0;
  document.getElementById('stat-best').textContent  = s.best != null ? s.best + '%' : '—';
  document.getElementById('stat-avg').textContent   = s.avgAccuracy != null ? s.avgAccuracy + '%' : '—';

  renderAchievements(data.achStats);

  const backBtn  = document.getElementById('profile-back');
  const shareBtn = document.getElementById('profile-share');
  if (isPublic) {
    if (backBtn)  { backBtn.textContent = 'На главную'; backBtn.onclick = () => { location.href = '/'; }; }
    if (shareBtn) shareBtn.style.display = 'none';
  } else {
    if (backBtn)  { backBtn.textContent = '← В меню'; backBtn.onclick = () => showScreen('start-screen'); }
    if (shareBtn) shareBtn.style.display = '';
  }

  const rows  = document.getElementById('profile-rows');
  const empty = document.getElementById('profile-empty');
  rows.innerHTML = '';
  const recent = data.recent || [];
  if (!recent.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  recent.forEach(r => {
    const row = document.createElement('div');
    row.className = 'pr-row' + (r.token ? ' clickable' : '');
    row.innerHTML =
      `<span class="pr-img">${escapeHtml(r.image || '—')}</span>` +
      `<span class="pr-style">${escapeHtml(r.style || '')}</span>` +
      `<span class="pr-num">${r.accuracy}%</span>` +
      `<span class="pr-num">${r.coverage}%</span>` +
      `<span class="pr-num pr-total">${r.total}%</span>` +
      `<span class="pr-date">${fmtDate(r.created_at)}</span>`;
    if (r.token) {
      row.title = 'Открыть результат';
      row.addEventListener('click', () => { history.pushState(null, '', '/r/' + r.token); openSharedResult(r.token); });
    }
    rows.appendChild(row);
  });
}

async function openProfile() {
  showScreen('profile-screen');
  let data;
  try { data = await api('/api/profile'); }
  catch (e) {
    document.getElementById('profile-name').textContent  = 'Не удалось загрузить';
    document.getElementById('profile-since').textContent = e.message;
    return;
  }
  renderProfile(data, { isPublic: false });
}

async function openPublicProfile(username) {
  showScreen('profile-screen');
  let data;
  try { data = await api('/api/u/' + encodeURIComponent(username)); }
  catch (e) {
    document.getElementById('profile-name').textContent  = 'Профиль не найден';
    document.getElementById('profile-since').textContent = '@' + username;
    document.getElementById('profile-rows').innerHTML = '';
    renderAchievements({});
    const empty = document.getElementById('profile-empty');
    empty.style.display = 'block'; empty.textContent = 'Такого пользователя нет.';
    const back = document.getElementById('profile-back');
    if (back) { back.textContent = 'На главную'; back.onclick = () => { location.href = '/'; }; }
    const share = document.getElementById('profile-share'); if (share) share.style.display = 'none';
    return;
  }
  renderProfile(data, { isPublic: true });
}

async function shareProfile() {
  if (!Auth.user) return;
  const url = location.origin + '/u/' + encodeURIComponent(Auth.user.username);
  try { await navigator.clipboard.writeText(url); showToast('Ссылка скопирована: ' + url); }
  catch { showToast(url); }
}

function renderSharedResult(data) {
  showScreen('result-screen');
  const scale = 4, rw = CANVAS_W * scale, rh = CANVAS_H * scale;
  const setup = id => { const c = document.getElementById(id); c.width = rw; c.height = rh;
    c.style.width = rw + 'px'; c.style.height = rh + 'px'; return c.getContext('2d'); };

  const cm = b64ToBytes(data.colormap || '');
  const pa = b64ToBytes(data.painted  || '');
  const maxDist = Math.sqrt(255 * 255 * 3);

  const oc = setup('result-original');
  const pc = setup('result-painted'); pc.fillStyle = '#f9f5ee'; pc.fillRect(0, 0, rw, rh);
  const dc = setup('result-diff');

  for (let row = 0; row < CANVAS_H; row++)
    for (let col = 0; col < CANVAS_W; col++) {
      const ci = (row * CANVAS_W + col) * 3;
      const pi = (row * CANVAS_W + col) * 4;
      oc.fillStyle = `rgb(${cm[ci]},${cm[ci+1]},${cm[ci+2]})`;
      oc.fillRect(col * scale, row * scale, scale, scale);
      const painted = pa[pi + 3] > 0;
      if (painted) { pc.fillStyle = `rgb(${pa[pi]},${pa[pi+1]},${pa[pi+2]})`; pc.fillRect(col * scale, row * scale, scale, scale); }
      let dcol;
      if (!painted) dcol = '#95a5a6';
      else {
        const dr = cm[ci]-pa[pi], dg = cm[ci+1]-pa[pi+1], db = cm[ci+2]-pa[pi+2];
        const dist = Math.sqrt(dr*dr + dg*dg + db*db) / maxDist;
        dcol = dist < 0.15 ? '#27ae60' : dist < 0.35 ? '#f39c12' : '#e74c3c';
      }
      dc.fillStyle = dcol; dc.fillRect(col * scale, row * scale, scale, scale);
    }

  document.getElementById('result-title').textContent    = data.image || 'Результат';
  document.getElementById('result-subtitle').textContent = 'работа игрока ' + data.username;

  const grade = data.accuracy >= 70 ? 'great' : data.accuracy >= 45 ? 'good' : 'poor';
  const acc = document.getElementById('score-accuracy'); acc.textContent = data.accuracy + '%'; acc.className = 'score-number ' + grade;
  document.getElementById('score-coverage').textContent = data.coverage + '%';
  const tot = document.getElementById('score-total'); tot.textContent = data.total + '%'; tot.className = 'score-number ' + grade;

  const author = document.getElementById('result-author');
  const link   = document.getElementById('result-author-link');
  if (author && link) {
    author.style.display = '';
    link.textContent = data.username;
    link.href = '/u/' + encodeURIComponent(data.username);
    link.onclick = e => { e.preventDefault(); history.pushState(null, '', link.href); openPublicProfile(data.username); };
  }

  document.getElementById('retry-btn').style.display = 'none';
  document.getElementById('next-btn').style.display  = 'none';
  const share = document.getElementById('result-share');
  if (share && data.token) {
    share.style.display = '';
    share.onclick = async () => {
      const url = location.origin + '/r/' + data.token;
      try { await navigator.clipboard.writeText(url); showToast('Ссылка на результат скопирована'); }
      catch { showToast(url); }
    };
  } else if (share) { share.style.display = 'none'; }
  const menu = document.getElementById('menu-btn'); menu.textContent = 'На главную'; menu.onclick = () => { location.href = '/'; };
}

async function openSharedResult(token) {
  let data;
  try { data = await api('/api/r/' + encodeURIComponent(token)); }
  catch (e) {
    showScreen('result-screen');
    document.getElementById('result-title').textContent    = 'Результат не найден';
    document.getElementById('result-subtitle').textContent = e.message;
    const menu = document.getElementById('menu-btn'); menu.textContent = 'На главную'; menu.onclick = () => { location.href = '/'; };
    return;
  }
  renderSharedResult(data);
}

async function playDaily() {
  let d;
  try { d = await api('/api/daily'); }
  catch { showToast('Не удалось загрузить картину дня'); return; }
  state.imageIdx = d.imageIdx;
  state.isDaily  = true;
  initGame();
  startPreview();
}

function galleryCard(w) {
  const card = document.createElement('div');
  card.className = 'gallery-item';
  card.title = (w.image || '') + ' · ' + w.username;

  const cv = document.createElement('canvas');
  const S = 2; cv.width = CANVAS_W * S; cv.height = CANVAS_H * S; cv.className = 'gallery-canvas';
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f9f5ee'; ctx.fillRect(0, 0, cv.width, cv.height);
  const pa = b64ToBytes(w.painted || '');
  for (let row = 0; row < CANVAS_H; row++)
    for (let col = 0; col < CANVAS_W; col++) {
      const i = (row * CANVAS_W + col) * 4;
      if (pa[i + 3]) { ctx.fillStyle = `rgb(${pa[i]},${pa[i+1]},${pa[i+2]})`; ctx.fillRect(col * S, row * S, S, S); }
    }
  card.appendChild(cv);

  const meta = document.createElement('div'); meta.className = 'gallery-meta';
  meta.innerHTML = `<span class="gi-user">${escapeHtml(w.username)}</span><span class="gi-score">${w.total}%</span>`;
  card.appendChild(meta);

  card.addEventListener('click', () => { history.pushState(null, '', '/r/' + w.token); openSharedResult(w.token); });
  return card;
}

async function openGallery() {
  showScreen('gallery-screen');

  try {
    const d = await api('/api/daily');
    const name = (typeof IMAGES !== 'undefined' && IMAGES[d.imageIdx]) ? IMAGES[d.imageIdx].name : '';
    document.getElementById('daily-name').textContent = name ? '— ' + name : '';
    const board = document.getElementById('daily-board');
    board.innerHTML = '';
    if (!d.leaders || !d.leaders.length) {
      board.innerHTML = '<div class="daily-empty">Сегодня ещё никто не играл — будьте первым!</div>';
    } else {
      d.leaders.forEach((l, i) => {
        const row = document.createElement('div'); row.className = 'daily-line';
        row.innerHTML = `<span class="dl-rank">${i + 1}</span><span class="dl-name">${escapeHtml(l.username)}</span><span class="dl-score">${l.best}%</span>`;
        board.appendChild(row);
      });
    }
  } catch (e) { }

  try {
    const g = await api('/api/gallery');
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    grid.innerHTML = '';
    const works = g.works || [];
    if (!works.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    works.forEach(w => grid.appendChild(galleryCard(w)));
  } catch (e) { }
}

function enterApp() {
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = Auth.user.username;
  showScreen('start-screen');
}

function initAuthUI() {
  const tabs   = document.querySelectorAll('.auth-tab');
  const errEl  = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');
  let mode = 'login';

  tabs.forEach(t => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    tabs.forEach(x => x.classList.toggle('active', x === t));
    submit.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
    errEl.textContent = '';
  }));

  async function submitForm() {
    const u = document.getElementById('auth-user').value.trim();
    const p = document.getElementById('auth-pass').value;
    errEl.textContent = ''; submit.disabled = true;
    try {
      if (mode === 'login') await Auth.login(u, p);
      else                  await Auth.register(u, p);
      document.getElementById('auth-pass').value = '';
      history.replaceState(null, '', '/');
      enterApp();
    } catch (e) { errEl.textContent = e.message; }
    finally { submit.disabled = false; }
  }

  submit.addEventListener('click', submitForm);
  ['auth-user', 'auth-pass'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitForm(); }));

  document.getElementById('logout-btn')?.addEventListener('click', async () => { await Auth.logout(); showScreen('auth-screen'); });
  document.getElementById('profile-btn')?.addEventListener('click', openProfile);
  document.getElementById('profile-back')?.addEventListener('click', () => showScreen('start-screen'));
  document.getElementById('profile-share')?.addEventListener('click', shareProfile);

  document.getElementById('daily-btn')?.addEventListener('click', playDaily);
  document.getElementById('gallery-btn')?.addEventListener('click', openGallery);
  document.getElementById('play-daily')?.addEventListener('click', playDaily);
  document.getElementById('gallery-back')?.addEventListener('click', () => {
    showScreen(Auth.user ? 'start-screen' : 'auth-screen');
  });
}

(async function () {
  initAuthUI();

  const mResult  = location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
  const mProfile = location.pathname.match(/^\/u\/([^\/]+)\/?$/);
  const isGallery = /^\/gallery\/?$/.test(location.pathname);

  if (mResult)  { await Auth.refresh().catch(() => {}); openSharedResult(mResult[1]); return; }
  if (mProfile) { await Auth.refresh().catch(() => {}); openPublicProfile(decodeURIComponent(mProfile[1])); return; }
  if (isGallery){ await Auth.refresh().catch(() => {}); openGallery(); return; }

  try {
    await Auth.refresh();
    if (Auth.user) enterApp();
    else showScreen('auth-screen');
  } catch {
    showScreen('auth-screen');
  }
})();