import { sendSms } from "./sms.js";
import { sendEmail, emailProvider } from "./email.js";

// Rappels et notifications : e-mail si la personne en a un, sinon SMS si elle a un vrai numéro.
// Pour ajouter WhatsApp plus tard, c'est ici qu'on branchera un troisième canal.
const smsOn = () => (process.env.SMS_PROVIDER || "console") !== "none";
export async function notify(u, subject, text) {
  if (u.email && emailProvider() !== "none") return sendEmail(u.email, subject, text);
  if (u.phone && !u.phone.startsWith("e:") && smsOn()) return sendSms(u.phone, text);
  throw new Error("Aucun canal de notification disponible");
}
