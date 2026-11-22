# Koshachi Ai

Мобильный веб-сайт для AI-ролок. Сервер: Node.js + Express. База данных: PostgreSQL (Neon). ИИ: Gemini API через OpenAI-compatible endpoint.

## Переменные окружения
- `DATABASE_URL` — строка подключения PostgreSQL из Neon.
- `GEMINI_API_KEY` — ключ Google AI Studio.
- `GEMINI_MODEL` — например `gemini-2.0-flash`.
- `PORT` — Render задаёт автоматически.

## Запуск
```bash
npm install
npm start
```

## Публикация на Render
Создайте Web Service из GitHub-репозитория. Build command: `npm install`. Start command: `npm start`. Добавьте переменные окружения из списка выше.

Не загружайте API-ключи в GitHub и не создавайте файл `.env` в публичном репозитории.
