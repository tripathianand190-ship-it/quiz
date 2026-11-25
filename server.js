// Quiz Board – zero-dependency Node.js server (Node 18+)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "questions.json"), "utf8"));
const SCORES_FILE = path.join(DATA_DIR, "scores.json");
const PER_QUIZ = 8, SESSION_TTL = 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
let scores = [];
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8")); } catch (e) { scores = []; }
function saveScores() {
  const tmp = SCORES_FILE + ".tmp";
  fs.writeFile(tmp, JSON.stringify(scores), err => { if (!err) fs.rename(tmp, SCORES_FILE, () => {}); });
}

const sessions = new Map();
setInterval(() => { const now = Date.now(); for (const [k, s] of sessions) if (now - s.start > SESSION_TTL) sessions.delete(k); }, 60000).unref();

const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h); return h.length > 120;
}

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", c => { d += c; if (d.length > 10000) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
  });
}
const clean = s => String(s || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20);

function leaderboard(topic) {
  return scores.filter(s => s.topic === topic).sort((a, b) => b.score - a.score || a.ms - b.ms || a.at - b.at)
    .slice(0, 10).map(({ name, score, total, ms }) => ({ name, score, total, seconds: Math.round(ms / 1000) }));
}

async function api(req, res, url) {
  const route = req.method + " " + url.pathname;

  if (route === "GET /api/health") return send(res, 200, { ok: true });

  if (route === "GET /api/topics") {
    return send(res, 200, Object.keys(QUESTIONS).map(t => ({
      topic: t, questions: Math.min(PER_QUIZ, QUESTIONS[t].length),
      top: (leaderboard(t)[0] || {}).score ?? null
    })));
  }

  if (route === "POST /api/start") {
    const { topic } = await readBody(req);
    const bank = QUESTIONS[topic];
    if (!bank) return send(res, 404, { error: "Unknown topic" });
    const picked = shuffle(bank).slice(0, PER_QUIZ).map((q, i) => {
      const order = shuffle(q.o.map((_, k) => k));
      return { id: i, q: q.q, o: order.map(k => q.o[k]), a: order.indexOf(q.a), n: q.n };
    });
    const id = crypto.randomUUID();
    sessions.set(id, { topic, qs: picked, answers: {}, start: Date.now(), done: false });
    return send(res, 200, { session: id, topic, questions: picked.map(({ id, q, o }) => ({ id, q, o })) });
  }

  if (route === "POST /api/answer") {
    const { session, id, choice } = await readBody(req);
    const s = sessions.get(session);
    if (!s || s.done) return send(res, 404, { error: "Session not found" });
    const q = s.qs[id];
    if (!q || s.answers[id] !== undefined) return send(res, 400, { error: "Invalid or repeated answer" });
    const c = Number.isInteger(choice) && choice >= 0 && choice < q.o.length ? choice : -1;
    s.answers[id] = c;
    return send(res, 200, { correct: c === q.a, answer: q.a, note: q.n });
  }

  if (route === "POST /api/finish") {
    const { session, name } = await readBody(req);
    const s = sessions.get(session);
    if (!s || s.done) return send(res, 404, { error: "Session not found" });
    s.done = true;
    const score = s.qs.filter(q => s.answers[q.id] === q.a).length;
    const ms = Date.now() - s.start, player = clean(name);
    if (player) { scores.push({ name: player, topic: s.topic, score, total: s.qs.length, ms, at: Date.now() }); if (scores.length > 5000) scores = scores.slice(-5000); saveScores(); }
    sessions.delete(session);
    return send(res, 200, { score, total: s.qs.length, board: leaderboard(s.topic) });
  }

  if (route === "GET /api/leaderboard") {
    const topic = url.searchParams.get("topic");
    if (!QUESTIONS[topic]) return send(res, 404, { error: "Unknown topic" });
    return send(res, 200, leaderboard(topic));
  }
  return send(res, 404, { error: "Not found" });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const SEC = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:"
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600", ...SEC });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
      if (limited(ip)) return send(res, 429, { error: "Too many requests" });
      return await api(req, res, url);
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) { send(res, 400, { error: "Bad request" }); }
});

if (require.main === module) server.listen(PORT, () => console.log("Quiz Board running on port " + PORT));
module.exports = server;
