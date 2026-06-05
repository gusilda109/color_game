/**
 * server.js — Express + WebSocket (совместный холст).
 * API: авторизация, результаты (+шаринг), профиль, публичный профиль,
 * картина дня, галерея, достижения. WS: комнаты совместного рисования на /ws.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const db = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'chromix-dev-secret-change-me',
  resave: false, saveUninitialized: false,
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

/* ── Авторизация ───────────────────────────────────────────── */
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

/* ── Результаты ────────────────────────────────────────────── */
app.post('/api/scores', requireAuth, (req, res) => {
  const b = req.body || {};
  const token = crypto.randomBytes(8).toString('hex');
  const cm = typeof b.colormap === 'string' ? b.colormap.slice(0, 40000) : null;
  const pa = typeof b.painted  === 'string' ? b.painted.slice(0, 40000)  : null;
  const daily = b.daily === true ? todayStr() : null;
  q.insertScore.run(req.session.userId, token, String(b.image || '').slice(0, 80), String(b.style || '').slice(0, 40),
    clamp(b.accuracy), clamp(b.coverage), clamp(b.total), cm, pa, daily);
  res.json({ ok: true, token });
});
app.get('/api/leaderboard', (req, res) => res.json({ leaders: q.leaderboard.all() }));
app.get('/api/my-scores', requireAuth, (req, res) => res.json({ scores: q.myScores.all(req.session.userId) }));
app.get('/api/profile', requireAuth, (req, res) => {
  const uid = req.session.userId;
  res.json({ user: q.findById.get(uid), stats: q.stats.get(uid), achStats: q.achStats.get(uid), recent: q.myScores.all(uid) });
});

/* ── Публичные данные ──────────────────────────────────────── */
app.get('/api/u/:username', (req, res) => {
  const user = q.publicUser.get(String(req.params.username));
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ user, stats: q.stats.get(user.id), achStats: q.achStats.get(user.id), recent: q.publicRecent.all(user.id) });
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

/* ── Статика и «красивые» ссылки ───────────────────────────── */
app.use(express.static(__dirname));
app.get(['/u/:username', '/r/:token', '/gallery', '/c/:room'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => console.log(`Chromix → http://localhost:${PORT}`));

/* ════════════════════════════════════════════════════════════
   WebSocket: КООПЕРАТИВ — общий холст одной картины
   room = { ref:{colormap,name,numColors,paintStyle}|null, painted:Map(key->[r,g,b]), clients:Set }
   ════════════════════════════════════════════════════════════ */
const CANVAS = 64;
const CURSOR_COLORS = ['#c0392b', '#2d54d8', '#27ae60', '#e67e22', '#5b2a86', '#16a085', '#d35400', '#8e44ad'];
const rooms = new Map();   // roomId -> { mode, ref, painted:Map, results:Map, clients:Set }

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { mode: 'coop', ref: null, painted: new Map(), results: new Map(), clients: new Set() });
  return rooms.get(id);
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, except) {
  const raw = JSON.stringify(obj);
  for (const c of room.clients) if (c !== except && c.readyState === 1) c.send(raw);
}
function userList(room) { return [...room.clients].map(c => ({ id: c.cid, name: c.cname, color: c.color })); }
function pushUsers(room) { broadcast(room, { type: 'users', users: userList(room) }); }
function paintedCells(room) { const out = []; for (const [k, c] of room.painted) out.push([k, c[0], c[1], c[2]]); return out; }
function resultList(room) { return room.results ? [...room.results.values()] : []; }
const clampB = v => Math.max(0, Math.min(255, v | 0));

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 600 * 1024 });
wss.on('connection', (ws) => {
  ws.cid = crypto.randomBytes(4).toString('hex');
  ws.color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
  ws.roomId = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const cleanId = String(m.room || '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '');

    if (m.type === 'create') {
      const id = cleanId || 'room';
      ws.roomId = id; ws.cname = String(m.name || 'ведущий').slice(0, 24);
      const room = getRoom(id);
      room.mode = m.mode === 'duel' ? 'duel' : 'coop';
      room.results = new Map();
      if (m.ref && typeof m.ref.colormap === 'string') room.ref = {
        colormap: m.ref.colormap.slice(0, 60000),
        name: String(m.ref.name || 'Совместная картина').slice(0, 80),
        numColors: m.ref.numColors | 0 || 6,
        paintStyle: String(m.ref.paintStyle || 'watercolor').slice(0, 40),
      };
      room.painted = new Map();
      if (Array.isArray(m.painted)) for (const c of m.painted) if (Array.isArray(c)) room.painted.set(String(c[0]), [c[1] | 0, c[2] | 0, c[3] | 0]);
      room.clients.add(ws);
      send(ws, { type: 'created', you: ws.cid, room: id, mode: room.mode });
      pushUsers(room);
      return;
    }

    if (m.type === 'join') {
      const id = cleanId || 'room';
      ws.roomId = id; ws.cname = String(m.name || 'гость').slice(0, 24);
      const room = getRoom(id);
      room.clients.add(ws);
      send(ws, { type: 'init', you: ws.cid, room: id, mode: room.mode || 'coop', ref: room.ref, painted: paintedCells(room), users: userList(room), results: resultList(room) });
      pushUsers(room);
      return;
    }

    const room = ws.roomId && rooms.get(ws.roomId);
    if (!room) return;

    if (m.type === 'ops' && Array.isArray(m.cells)) {
      const cells = [];
      for (const c of m.cells) {
        if (!Array.isArray(c)) continue;
        const key = String(c[0]);
        if (!/^\d{1,3},\d{1,3}$/.test(key)) continue;
        const rgb = [clampB(c[1]), clampB(c[2]), clampB(c[3])];
        room.painted.set(key, rgb); cells.push([key, rgb[0], rgb[1], rgb[2]]);
      }
      if (cells.length) broadcast(room, { type: 'ops', cells }, ws);
    } else if (m.type === 'cursor') {
      broadcast(room, { type: 'cursor', id: ws.cid, name: ws.cname, color: ws.color, col: m.col | 0, row: m.row | 0 }, ws);
    } else if (m.type === 'clear') {
      room.painted.clear(); broadcast(room, { type: 'clear' });
    } else if (m.type === 'duel-result') {
      if (!room.results) room.results = new Map();
      room.results.set(ws.cid, {
        id: ws.cid, name: String(m.name || ws.cname || 'игрок').slice(0, 24),
        accuracy: m.accuracy | 0, total: m.total | 0,
        painted: typeof m.painted === 'string' ? m.painted.slice(0, 40000) : '',
      });
      broadcast(room, { type: 'duel-update', results: resultList(room) });   // всем, включая отправителя
    }
  });

  ws.on('close', () => {
    const room = ws.roomId && rooms.get(ws.roomId);
    if (!room) return;
    room.clients.delete(ws);
    broadcast(room, { type: 'leave', id: ws.cid });
    pushUsers(room);
    if (room.clients.size === 0) setTimeout(() => { const r = rooms.get(ws.roomId); if (r && r.clients.size === 0) rooms.delete(ws.roomId); }, 15 * 60 * 1000);
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 30000);
