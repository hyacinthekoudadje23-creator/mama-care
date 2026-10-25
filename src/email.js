// Envoi d'e-mails : "console" (affiche dans les logs, par défaut) ou "brevo" (API transactionnelle).
export const emailProvider = () => process.env.EMAIL_PROVIDER || "console";

export async function sendEmail(to, subject, text) {
  if (emailProvider() === "brevo") {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: process.env.EMAIL_FROM_NAME || "Mama Care", email: process.env.EMAIL_FROM }, to: [{ email: to }], subject, textContent: text }),
    });
    if (!r.ok) throw new Error("Envoi e-mail refusé (" + r.status + ")");
    return;
  }
  console.log(`[E-MAIL vers ${to}] ${subject} | ${text}`);
}
