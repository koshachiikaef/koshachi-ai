import express from "express";
import pg from "pg";

const app = express();
const { Pool } = pg;
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon.tech") ? { rejectUnauthorized: false } : undefined
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '', memory TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, character_ids INTEGER[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY, chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
const api = (path, fn) => app.get(path, async (req,res) => { try { await fn(req,res); } catch(e) { console.error(e); res.status(500).json({error:"Ошибка сервера"}); } });

app.get("/api/characters", async (_,res) => {
  try { const r = await pool.query("SELECT * FROM characters ORDER BY id DESC"); res.json(r.rows); }
  catch(e) { console.error(e); res.status(500).json({error:"Не удалось загрузить персонажей"}); }
});
app.post("/api/characters", async (req,res) => {
  try {
    const {name,description="",system_prompt=""} = req.body;
    if (!name?.trim()) return res.status(400).json({error:"Укажи имя персонажа"});
    const r = await pool.query("INSERT INTO characters(name,description,system_prompt) VALUES($1,$2,$3) RETURNING *",[name,description,system_prompt]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:"Не удалось создать персонажа"}); }
});
app.get("/api/chats", async (_,res) => {
  try { const r = await pool.query("SELECT * FROM chats ORDER BY id DESC"); res.json(r.rows); }
  catch(e) { console.error(e); res.status(500).json({error:"Не удалось загрузить чаты"}); }
});
app.post("/api/chats", async (req,res) => {
  try {
    const {title,character_ids=[]} = req.body;
    const r = await pool.query("INSERT INTO chats(title,character_ids) VALUES($1,$2) RETURNING *",[title || "Новая ролка",character_ids]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:"Не удалось создать чат"}); }
});
app.get("/api/chats/:id/messages", async (req,res) => {
  try { const r = await pool.query("SELECT * FROM messages WHERE chat_id=$1 ORDER BY id",[req.params.id]); res.json(r.rows); }
  catch(e) { console.error(e); res.status(500).json({error:"Не удалось загрузить сообщения"}); }
});
app.post("/api/chats/:id/messages", async (req,res) => {
  try {
    const {content} = req.body;
    if (!content?.trim()) return res.status(400).json({error:"Пустое сообщение"});
    const chat = (await pool.query("SELECT * FROM chats WHERE id=$1",[req.params.id])).rows[0];
    if (!chat) return res.status(404).json({error:"Чат не найден"});
    await pool.query("INSERT INTO messages(chat_id,role,content) VALUES($1,'user',$2)",[chat.id,content]);
    const history = (await pool.query("SELECT role,content FROM messages WHERE chat_id=$1 ORDER BY id DESC LIMIT 30",[chat.id])).rows.reverse();
    const chars = chat.character_ids.length ? (await pool.query("SELECT * FROM characters WHERE id=ANY($1)",[chat.character_ids])).rows : [];
    const system = chars.length ? chars.map(c=>`Персонаж: ${c.name}\nОписание: ${c.description}\nХарактер и правила: ${c.system_prompt}\nПамять: ${c.memory}`).join("\n\n") : "Ты — внимательный собеседник для текстовой ролевой игры. Пиши на русском.";
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({error:"Добавь GEMINI_API_KEY в переменные окружения сервера"});
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.GEMINI_API_KEY}`},
      body:JSON.stringify({model,messages:[{role:"system",content:system},...history],temperature:0.9})
    });
    const data = await response.json();
    if (!response.ok) { console.error(data); return res.status(502).json({error:"ИИ не ответил. Проверь API-ключ и лимит Gemini."}); }
    const answer = data.choices?.[0]?.message?.content || "Не удалось получить ответ.";
    const saved = await pool.query("INSERT INTO messages(chat_id,role,content) VALUES($1,'assistant',$2) RETURNING *",[chat.id,answer]);
    res.json(saved.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:"Ошибка при отправке сообщения"}); }
});
app.patch("/api/messages/:id", async (req,res) => {
  try {
    const r = await pool.query("UPDATE messages SET content=$1 WHERE id=$2 RETURNING *",[req.body.content,req.params.id]);
    if (!r.rowCount) return res.status(404).json({error:"Сообщение не найдено"});
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:"Не удалось изменить сообщение"}); }
});
app.get("/health", (_,res)=>res.send("ok"));

const port = process.env.PORT || 3000;
init().then(()=>app.listen(port,"0.0.0.0",()=>console.log(`Koshachi Ai running on ${port}`)))
.catch(e=>{console.error("Database initialization failed",e);process.exit(1);});
