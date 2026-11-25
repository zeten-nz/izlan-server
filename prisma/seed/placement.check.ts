/**
 * Daraja testi bankining statik tekshiruvi (DB'siz): `npm run check:placement`.
 * Sxema, takror, daraja mosligi, har darajada 30 ta savol va to'g'ri javob o'rinlarining taqsimoti.
 */
import { finalBank, validatePlacementBank } from "./placement";

const errors = validatePlacementBank();
const bank = finalBank();
const per = new Map<string, number>();
for (const q of bank) per.set(q.level, (per.get(q.level) ?? 0) + 1);
for (const lv of ["A1", "A2", "B1", "B2", "C1", "C2"]) if (per.get(lv) !== 30) errors.push(`${lv}: ${per.get(lv) ?? 0} ta savol (30 kerak)`);
if (new Set(bank.map((q) => q.key)).size !== bank.length) errors.push("takroriy kalit");
const pos = [0, 0, 0, 0];
for (const q of bank) pos[q.correct]++;
const share = pos.map((n) => n / bank.length);
if (share.some((s) => s < 0.15 || s > 0.35)) errors.push(`to'g'ri javob o'rinlari notekis: ${share.map((s) => `${Math.round(s * 100)}%`).join(" / ")}`);

if (errors.length) {
  console.error(`✘ Daraja testi banki:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`✔ Daraja testi banki: ${bank.length} savol, darajalar ${[...per].map(([k, v]) => `${k} ${v}`).join(", ")}; to'g'ri javob o'rinlari ${share.map((s) => `${Math.round(s * 100)}%`).join(" / ")}`);
