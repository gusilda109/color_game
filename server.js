const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'chromix-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

const SCENES = 4;
function todayStr() { return new Date().toISOString().slice(0, 10); }
function dailyIndex(dateStr) {
  const day = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 86400000);
  return ((day % SCENES) + SCENES) % SCENES;
}

const q = {
  insertUser:  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  findByName:  db.prepare('SELECT * FROM users WHERE username = ?'),
  findById:    db.prepare('SELECT id, username, created_at FROM users WHERE id = ?'),

  insertScore: db.prepare(`INSERT INTO scores (user_id, token, image, style, accuracy, coverage, total, colormap, painted, daily_date)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  leaderboard: db.prepare(`SELECT u.username, MAX(s.total) AS best, COUNT(s.id) AS games
                           FROM scores s JOIN users u ON u.id = s.user_id
                           GROUP BY s.user_id ORDER BY best DESC, games DESC LIMIT 10`),
  myScores:    db.prepare(`SELECT token, image, style, accuracy, coverage, total, created_at
                           FROM scores WHERE user_id = ? ORDER BY id DESC LIMIT 20`),
  stats:       db.prepare(`SELECT COUNT(*) AS games, MAX(total) AS best, ROUND(AVG(accuracy)) AS avgAccuracy
                           FROM scores WHERE user_id = ?`),
  achStats:    db.prepare(`SELECT COUNT(*) AS games, MAX(accuracy) AS maxAccuracy, MAX(coverage) AS maxCoverage,
                                  MAX(total) AS maxTotal,
                                  SUM(CASE WHEN daily_date IS NOT NULL THEN 1 ELSE 0 END) AS dailyGames
                           FROM scores WHERE user_id = ?`),

  publicUser:   db.prepare('SELECT id, username, created_at FROM users WHERE username = ?'),
  publicRecent: db.prepare(`SELECT token, image, style, accuracy, coverage, total, created_at
                            FROM scores WHERE user_id = ? ORDER BY id DESC LIMIT 20`),

  resultByToken: db.prepare(`SELECT s.token, s.image, s.style, s.accuracy, s.coverage, s.total,
                                    s.colormap, s.painted, s.created_at, u.username
                             FROM scores s JOIN users u ON u.id = s.user_id WHERE s.token = ?`),

  dailyLeaders: db.prepare(`SELECT u.username, MAX(s.total) AS best
                            FROM scores s JOIN users u ON u.id = s.user_id
                            WHERE s.daily_date = ?
                            GROUP BY s.user_id ORDER BY best DESC, MIN(s.id) ASC LIMIT 10`),
  gallery:      db.prepare(`SELECT s.token, s.image, s.total, s.accuracy, s.painted, u.username
                            FROM scores s JOIN users u ON u.id = s.user_id
                            WHERE s.painted IS NOT NULL
                            ORDER BY s.total DESC, s.accuracy DESC, s.id DESC LIMIT 12`),
};

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Нужно войти' });
  next();
}
const clamp = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

app.post('/api/register', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (username.length < 3 || username.length > 24) return res.status(400).json({ error: 'Имя: от 3 до 24 символов' });
  if (password.length < 6)                          return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
  if (q.findByName.get(username))                   return res.status(409).json({ error: 'Это имя уже занято' });
  const hash = bcrypt.hashSync(password, 10);
  const info = q.insertUser.run(username, hash);
  req.session.userId = info.lastInsertRowid;
  res.json({ user: { id: info.lastInsertRowid, username } });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = username && q.findByName.get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Неверное имя или пароль' });
  req.session.userId = user.id;
  res.json({ user: { id: user.id, username: user.username } });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: q.findById.get(req.session.userId) || null });
});

app.post('/api/scores', requireAuth, (req, res) => {
  const b = req.body || {};
  const token = crypto.randomBytes(8).toString('hex');
  const cm = typeof b.colormap === 'string' ? b.colormap.slice(0, 40000) : null;
  const pa = typeof b.painted  === 'string' ? b.painted.slice(0, 40000)  : null;
  const daily = b.daily === true ? todayStr() : null;
  q.insertScore.run(
    req.session.userId, token,
    String(b.image || '').slice(0, 80), String(b.style || '').slice(0, 40),
    clamp(b.accuracy), clamp(b.coverage), clamp(b.total),
    cm, pa, daily,
  );
  res.json({ ok: true, token });
});

app.get('/api/leaderboard', (req, res) => res.json({ leaders: q.leaderboard.all() }));
app.get('/api/my-scores', requireAuth, (req, res) => res.json({ scores: q.myScores.all(req.session.userId) }));

app.get('/api/profile', requireAuth, (req, res) => {
  const uid = req.session.userId;
  res.json({
    user:    q.findById.get(uid),
    stats:   q.stats.get(uid),
    achStats:q.achStats.get(uid),
    recent:  q.myScores.all(uid),
  });
});

app.get('/api/u/:username', (req, res) => {
  const user = q.publicUser.get(String(req.params.username));
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({
    user,
    stats:    q.stats.get(user.id),
    achStats: q.achStats.get(user.id),
    recent:   q.publicRecent.all(user.id),
  });
});

app.get('/api/r/:token', (req, res) => {
  const r = q.resultByToken.get(String(req.params.token));
  if (!r) return res.status(404).json({ error: 'Результат не найден' });
  res.json(r);
});

app.get('/api/daily', (req, res) => {
  const date = todayStr();
  res.json({ date, imageIdx: dailyIndex(date), leaders: q.dailyLeaders.all(date) });
});

app.get('/api/gallery', (req, res) => res.json({ works: q.gallery.all() }));

app.use(express.static(__dirname));
app.get(['/u/:username', '/r/:token', '/gallery'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Chromix → http://localhost:${PORT}`));