import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { sendSms } from "./sms.js";
import { rebuild, startScheduler } from "./reminders.js";

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 24) { console.error("JWT_SECRET (24 caractères minimum) est obligatoire."); process.exit(1); }
const ADMINS = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);
const OTP_TTL = 5 * 60e3, now = () => Date.now();

const app = express();
app.set("trust proxy", 1);
const csp = helmet.contentSecurityPolicy.getDefaultDirectives();
app.use(
  helmet({ contentSecurityPolicy: { directives: { ...csp,
    "script-src": ["'self'", "'unsafe-inline'"], "script-src-attr": ["'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], "font-src": ["'self'", "https://fonts.gstatic.com"],
    "upgrade-insecure-requests": null } } }),
  cors({ origin: (process.env.CORS_ORIGIN || "").split(",").filter(Boolean) }),
  express.json({ limit: "300kb" }),
);
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url)))); // l'application web (même adresse que l'API)

const wrap = (f) => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const lim = (max, min) => rateLimit({ windowMs: min * 60e3, max, standardHeaders: true, legacyHeaders: false });
const phoneSchema = z.string()
  .transform((s) => { s = s.replace(/[\s().-]/g, ""); return s.startsWith("00") ? "+" + s.slice(2) : s; })
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro au format international, ex. +22997000000"));
const hash = (p, c) => crypto.createHmac("sha256", SECRET).update(p + ":" + c).digest("hex");
const pub = (u) => ({ id: u.id, phone: u.phone, name: u.name, role: u.role, smsOptin: !!u.sms_optin });
const userById = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);

// ---------- Comptes : connexion par numéro de téléphone + code SMS ----------
app.get("/health", (q, r) => r.json({ ok: true }));

app.post("/auth/request", lim(10, 15), wrap(async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
  const o = db.prepare("SELECT expires_at FROM otps WHERE phone=?").get(phone);
  if (o && o.expires_at - OTP_TTL > now() - 60e3) return res.status(429).json({ error: "Attendez une minute avant de redemander un code." });
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  db.prepare(`INSERT INTO otps(phone,hash,expires_at,attempts) VALUES(?,?,?,0)
    ON CONFLICT(phone) DO UPDATE SET hash=excluded.hash, expires_at=excluded.expires_at, attempts=0`).run(phone, hash(phone, code), now() + OTP_TTL);
  await sendSms(phone, `Mama Care: votre code est ${code}. Il expire dans 5 minutes.`);
  res.json({ ok: true });
}));

app.post("/auth/verify", lim(20, 15), wrap((req, res) => {
  const b = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/), name: z.string().trim().max(60).optional() }).parse(req.body);
  const o = db.prepare("SELECT * FROM otps WHERE phone=?").get(b.phone);
  if (!o || o.expires_at < now() || o.attempts >= 5) return res.status(401).json({ error: "Code expiré ou trop d’essais. Demandez un nouveau code." });
  if (!crypto.timingSafeEqual(Buffer.from(o.hash), Buffer.from(hash(b.phone, b.code)))) {
    db.prepare("UPDATE otps SET attempts=attempts+1 WHERE phone=?").run(b.phone);
    return res.status(401).json({ error: "Code incorrect." });
  }
  db.prepare("DELETE FROM otps WHERE phone=?").run(b.phone);
  let u = db.prepare("SELECT * FROM users WHERE phone=?").get(b.phone);
  if (!u) {
    const id = db.prepare("INSERT INTO users(phone,name,role,created_at) VALUES(?,?,?,?)")
      .run(b.phone, b.name || null, ADMINS.includes(b.phone) ? "admin" : "mama", now()).lastInsertRowid;
    u = userById(id);
  } else if (ADMINS.includes(b.phone) && u.role !== "admin") {
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(u.id); u.role = "admin";
  }
  res.json({ token: jwt.sign({ sub: u.id }, SECRET, { expiresIn: "30d" }), user: pub(u) });
}));

const auth = (req, res, next) => {
  try {
    const { sub } = jwt.verify((req.headers.authorization || "").replace(/^Bearer /, ""), SECRET);
    const u = userById(sub); if (!u) throw 0;
    req.user = u; next();
  } catch { res.status(401).json({ error: "Non connecté." }); }
};
const isPro = (u) => u.role === "pro" || u.role === "admin";
const need = (f) => (req, res, next) => (f(req.user) ? next() : res.status(403).json({ error: "Accès refusé." }));

app.get("/me", auth, (req, res) => res.json(pub(req.user)));
app.patch("/me", auth, wrap((req, res) => {
  const b = z.object({ name: z.string().trim().max(60).optional(), smsOptin: z.boolean().optional() }).parse(req.body);
  db.prepare("UPDATE users SET name=COALESCE(?,name), sms_optin=COALESCE(?,sms_optin) WHERE id=?")
    .run(b.name ?? null, b.smsOptin === undefined ? null : +b.smsOptin, req.user.id);
  res.json(pub(userById(req.user.id)));
}));

// ---------- Suivi de grossesse (même objet S que l'application) + rappels SMS ----------
app.get("/state", auth, (req, res) => {
  const r = db.prepare("SELECT data, updated_at FROM profiles WHERE user_id=?").get(req.user.id);
  res.json(r ? { s: JSON.parse(r.data), t: r.updated_at } : { s: null, t: 0 });
});
app.put("/state", auth, wrap((req, res) => {
  const { s } = z.object({ s: z.object({}).passthrough() }).parse(req.body);
  const t = now();
  db.prepare(`INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(req.user.id, JSON.stringify(s), t);
  const lmp = s.p && s.p.lmp;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lmp || "")) rebuild(req.user.id, lmp);
  res.json({ ok: true, t });
}));

// ---------- Consultation en ligne ----------
// Une maman a un seul fil (id "me"). Les professionnelles voient tous les fils.
function access(req, res) {
  const u = req.user; let t;
  if (req.params.id === "me") {
    t = db.prepare("SELECT * FROM threads WHERE mama_id=?").get(u.id)
      || db.prepare("SELECT * FROM threads WHERE id=?").get(db.prepare("INSERT INTO threads(mama_id) VALUES(?)").run(u.id).lastInsertRowid);
  } else {
    t = db.prepare("SELECT * FROM threads WHERE id=?").get(+req.params.id);
    if (!t || !(isPro(u) || t.mama_id === u.id)) { res.status(404).json({ error: "Introuvable." }); return null; }
  }
  return t;
}
app.get("/threads", auth, need(isPro), (req, res) => res.json(db.prepare(`
  SELECT t.id, t.last_text lastText, t.last_at lastAt, t.last_from lastFrom, u.name, u.phone
  FROM threads t JOIN users u ON u.id=t.mama_id WHERE t.last_at IS NOT NULL ORDER BY t.last_at DESC LIMIT 100`).all()));
app.get("/threads/:id/messages", auth, (req, res) => {
  const t = access(req, res); if (!t) return;
  res.json({ threadId: t.id, messages: db.prepare(
    "SELECT id, from_role fromRole, text, created_at createdAt FROM messages WHERE thread_id=? AND id>? ORDER BY id LIMIT 200").all(t.id, +req.query.after || 0) });
});
app.post("/threads/:id/messages", auth, lim(30, 1), wrap(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
  const t = access(req, res); if (!t) return;
  const from = req.params.id === "me" || !isPro(req.user) ? "mama" : "pro", at = now();
  const id = db.transaction(() => {
    const mid = db.prepare("INSERT INTO messages(thread_id,sender_id,from_role,text,created_at) VALUES(?,?,?,?,?)").run(t.id, req.user.id, from, text, at).lastInsertRowid;
    db.prepare("UPDATE threads SET last_text=?, last_at=?, last_from=? WHERE id=?").run(text.slice(0, 120), at, from, t.id);
    return mid;
  })();
  if (from === "pro") { // prévenir la maman par SMS
    const m = userById(t.mama_id);
    if (m && m.sms_optin) sendSms(m.phone, "Mama Care: votre sage-femme vous a répondu. Ouvrez l'application pour lire le message.").catch((e) => console.error("SMS réponse", e.message));
  }
  res.status(201).json({ id });
}));

// ---------- Assistante IA (la clé reste sur le serveur) ----------
const SYS = "Tu es l'assistante de Mama Care, une application de suivi de grossesse pour des femmes en Afrique de l'Ouest. Réponds en français simple, en 5 phrases maximum, avec bienveillance. Tu donnes des informations générales, jamais de diagnostic ni de dose de médicament. Si la question évoque un signe de danger (saignement, convulsions, perte de liquide, maux de tête forts avec vue trouble, fièvre, moins de mouvements du bébé, douleur forte), dis d'aller tout de suite à la maternité. Sinon, rappelle de voir une sage-femme en cas de doute.";
app.post("/assistant", auth, lim(20, 1), wrap(async (req, res) => {
  const b = z.object({ question: z.string().trim().min(1).max(1000), context: z.string().max(500).optional(),
    history: z.array(z.object({ r: z.enum(["me", "bot"]), t: z.string().max(1500) })).max(6).optional() }).parse(req.body);
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Assistante indisponible." });
  const h = [...(b.history || [])]; while (h.length && h[0].r !== "me") h.shift();
  const messages = [...h.filter((x) => x.t && x.t !== "…").map((x) => ({ role: x.r === "me" ? "user" : "assistant", content: x.t })), { role: "user", content: b.question }];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 400, system: SYS + (b.context ? "\nContexte : " + b.context : ""), messages }) });
  if (!r.ok) { console.error("Assistante", r.status); return res.status(502).json({ error: "Assistante indisponible." }); }
  const j = await r.json();
  res.json({ text: (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim() });
}));

// ---------- Administration : nommer les professionnelles de santé ----------
app.get("/admin/users", auth, need((u) => u.role === "admin"), (req, res) =>
  res.json(db.prepare("SELECT id, phone, name, role FROM users ORDER BY id DESC LIMIT 200").all()));
app.patch("/admin/users/:id/role", auth, need((u) => u.role === "admin"), wrap((req, res) => {
  const { role } = z.object({ role: z.enum(["mama", "pro"]) }).parse(req.body);
  res.json({ ok: db.prepare("UPDATE users SET role=? WHERE id=? AND role!='admin'").run(role, +req.params.id).changes > 0 });
}));

app.use((e, req, res, next) => {
  if (e instanceof z.ZodError) return res.status(400).json({ error: "Données invalides.", details: e.issues.map((i) => i.path.join(".") + " : " + i.message) });
  console.error(e); res.status(500).json({ error: "Erreur serveur." });
});

startScheduler();
app.listen(process.env.PORT || 3000, () => console.log("Mama Care API prête"));
