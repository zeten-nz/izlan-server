# Grammar (server)

Ikki manba rejimi (`GRAMMAR_SOURCE`, bitta qiymat; parallel o'qilmaydi):

- `static` (standart, o'tish davri) — `grammar-registry.data.ts` (client repo'dan `npm run grammar:export-registry` bilan generatsiya; qo'lda tahrirlamang), `registry.ts` xesh/sxema tekshiradi (fail-closed).
- `release` — PostgreSQL: aktiv `GrammarRelease` (`GrammarActivation` oxirgi qatori) + kill-switch overlay. `GrammarService` shundan reyestr quradi.

Server hujjatdagi qoida nomi/holati/tiliga ishonmaydi: faqat `grammarRuleId`, qolgani reyestrdan.

## DB rejimi modullari

| Fayl | Vazifa |
|---|---|
| `content.schema.ts` | qoida kontenti (zod3, strict), til tekshiruvi, to'liqlik, litsenziya darvozasi, `contentHash` |
| `permissions.ts` | **yagona** ruxsat joyi (Teacher/Admin); `canApprove` — reviewer kengaytmasi nuqtasi |
| `state-machine.ts` | revision holat o'tishlari (DB trigger bilan bir xil jadval) |
| `content.service.ts` | yaratish, `rev`-qulfli saqlash, topshirish, tasdiqlash, soft-delete, hide/retire, tarix |
| `release.service.ts` | candidate (darvozalar, diff, ta'sir), aktivlash/rollback, bundle |
| `grammar.controllers.ts` | `staff/grammar/*` (Teacher+Admin), `admin/grammar/*` (Admin), `internal/grammar/*` (client server-to-server, `x-grammar-internal` tokeni) |
| `import-export.ts`, `cli.ts` | Git→DB import (dry-run), eksport, **aktivlash faqat CLI** |

Aktivlash HTTP orqali **mumkin emas**. DB trigger'lari (migration `20261019104339_grammar_content_release`) approved revision o'zgarmasligini,
audit/release/aktivlash jurnallarining append-only ekanini majburlaydi.

Testlar: `grammar.content.spec.ts` (unit), `grammar.db.spec.ts` (izolyatsiyalangan PostgreSQL; `GRAMMAR_TEST_DATABASE_URL` yo'q bo'lsa o'tkazib yuboriladi; baza nomi `izlan_g<N>`, `izlan_e2e*` yoki `izlan_test_ci` bo'lishi shart).

Deploy tartibi, xavf modeli va rollback: client repo → `docs/grammar/RELEASE-RUNBOOK.md`, qarorlar: `docs/grammar/ADR-001-db-source-and-release.md`.
Reyestr xeshi yaxlitlik nazorati, **autentifikatsiya emas**.
