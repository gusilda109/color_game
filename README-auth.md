# Chromix — бэкенд (пользователи, вход, результаты)

## Куда класть файлы

```
chromix/                 ← корень проекта
├── index.html
├── mixbox.js
├── css/style.css
├── js/
│   ├── images.js  palette.js  game.js  ui.js  main.js
│   └── auth.js          ← НОВЫЙ (из auth.js)
├── server.js            ← НОВЫЙ
├── db.js                ← НОВЫЙ
└── package.json         ← НОВЫЙ
```

`server.js`, `db.js`, `package.json` кладём в корень рядом с `index.html`.
`auth.js` кладём в папку `js/`.

## Запуск

```bash
npm install        # ставит express, express-session, better-sqlite3, bcryptjs
npm start          # запускает сервер
```

Открыть в браузере: **http://localhost:3000**
(Важно: теперь игра открывается по этому адресу, а НЕ двойным кликом по index.html —
иначе фронт не достучится до API.)

База `chromix.db` создаётся автоматически при первом запуске.

## Что появилось

- Регистрация и вход; пароли хранятся только в виде bcrypt-хэша.
- Сессия на httpOnly-cookie (живёт 7 дней).
- Таблица `scores` + сохранение результата после каждой игры и лидерборд.

## Перед публикацией в интернет (не для localhost)

- Задать переменную окружения `SESSION_SECRET` (длинная случайная строка).
- Раздавать по HTTPS и включить `cookie.secure = true` в `server.js`.
- Заменить стандартное хранилище сессий (MemoryStore) на постоянное
  (например, connect-sqlite3 / Redis) — иначе сессии теряются при перезапуске.
- Имеет смысл добавить ограничение частоты запросов на /api/login и /api/register.
