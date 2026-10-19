// Les SMS restent en alphabet GSM (sans accents ni apostrophe typographique) :
// un SMS coûte alors 160 caractères au lieu de 70.
const gsm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'");

export async function sendSms(to, text) {
  const msg = gsm(text);
  if (process.env.SMS_PROVIDER === "africastalking") {
    const base = process.env.AT_SANDBOX === "1" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
    const body = new URLSearchParams({ username: process.env.AT_USERNAME, to, message: msg });
    if (process.env.AT_SENDER) body.set("from", process.env.AT_SENDER);
    const r = await fetch(`${base}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: process.env.AT_API_KEY, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) throw new Error("Envoi SMS refusé (" + r.status + ")");
    return;
  }
  console.log(`[SMS vers ${to}] ${msg}`);
}
