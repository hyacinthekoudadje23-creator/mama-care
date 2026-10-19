import db from "./db.js";
import { sendSms } from "./sms.js";

const CPN = [12, 20, 26, 30, 34, 36, 38, 40]; // 8 contacts recommandés par l'OMS
const H = 3600e3, D = 24 * H;
const fr = (t) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Porto-Novo" });

// Recalcule les rappels à venir d'une maman à partir de la date des dernières règles (AAAA-MM-JJ).
// Envoi à 8 h (heure du Bénin, UTC+1) : visite prénatale J-2, puis un rappel hebdomadaire.
export function rebuild(userId, lmp) {
  const L = Date.parse(lmp + "T07:00:00Z"), now = Date.now();
  const ins = db.prepare("INSERT OR IGNORE INTO reminders(user_id, kind, due_at, text) VALUES(?,?,?,?)");
  const run = db.transaction(() => {
    db.prepare("DELETE FROM reminders WHERE user_id=? AND sent_at IS NULL").run(userId);
    for (const w of CPN) {
      const visit = L + w * 7 * D, due = visit - 2 * D;
      if (due > now) ins.run(userId, "visit" + w, due, `Mama Care: votre visite prénatale des ${w} SA est prévue vers le ${fr(visit)}. Pensez à prendre rendez-vous.`);
    }
    for (let k = 1, t = now + 7 * D; t < L + 280 * D && k <= 40; k++, t += 7 * D)
      ins.run(userId, "weekly", Math.floor(t / D) * D + 7 * H, "Mama Care: pensez au fer et à l'acide folique, et dormez sous moustiquaire. Un doute ? Écrivez à votre sage-femme.");
  });
  run();
}

export function startScheduler() {
  const tick = async () => {
    const now = Date.now();
    db.prepare("UPDATE reminders SET sent_at=-1 WHERE sent_at IS NULL AND due_at<?").run(now - D); // trop en retard : abandonné
    const rows = db.prepare(`SELECT r.id, r.text, u.phone, u.sms_optin o FROM reminders r JOIN users u ON u.id=r.user_id
      WHERE r.sent_at IS NULL AND r.due_at<=? ORDER BY r.due_at LIMIT 50`).all(now);
    for (const r of rows) {
      if (!r.o) { db.prepare("UPDATE reminders SET sent_at=-1 WHERE id=?").run(r.id); continue; }
      try { await sendSms(r.phone, r.text); db.prepare("UPDATE reminders SET sent_at=? WHERE id=?").run(Date.now(), r.id); }
      catch (e) { console.error("Rappel", r.id, e.message); }
    }
  };
  setInterval(() => tick().catch(console.error), 60e3);
  tick().catch(console.error);
}
