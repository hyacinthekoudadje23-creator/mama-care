import fs from "node:fs";
import path from "node:path";
import db from "./db.js";

// Copie quotidienne de la base à côté d'elle (dossier "backups"), en gardant les 7 plus récentes.
// Cela protège d'une erreur ou d'une corruption ; pour se protéger de la perte du disque,
// l'administrateur télécharge aussi une copie depuis l'onglet Profil.
export function startBackups() {
  const dir = path.join(path.dirname(process.env.DB_PATH || "./mamacare.db"), "backups");
  const run = async () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, "mamacare-" + new Date().toISOString().slice(0, 10) + ".db");
      if (!fs.existsSync(f)) await db.backup(f);
      fs.readdirSync(dir).filter((n) => n.startsWith("mamacare-")).sort().slice(0, -7).forEach((n) => fs.unlinkSync(path.join(dir, n)));
    } catch (e) { console.error("Sauvegarde", e.message); }
  };
  run();
  setInterval(run, 6 * 3600e3);
}
