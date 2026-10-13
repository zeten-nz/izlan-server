#!/usr/bin/env bash
# Izlan restore: backup papkasidan DB (pg_restore) va/yoki uploads (tar.gz) ni tiklaydi.
#
# Standart xatti-harakat XAVFSIZ: yangi (mavjud bo'lmagan) DB yaratadi va bo'sh uploads papkasiga ochadi.
# Production'ga tiklash ruxsat etilmaydi, FAQAT quyidagilar birgalikda bo'lsa:
#   1) --overwrite-existing bayrog'i
#   2) interaktiv terminalda aynan `RESTORE-PRODUCTION <nom>` yozilgan tasdiq (env/pipe orqali aylanib o'tib bo'lmaydi)
#
# Foydalanish:
#   restore.sh <backup-papka> --db <yangi_db_nomi> [--uploads-dir <yangi_papka>] [--db-only | --uploads-only]
#   restore.sh <backup-papka> --verify-only        # faqat yaxlitlikni tekshiradi, hech narsa yozmaydi
#
# Chiqish kodlari: 0 OK | 2 argument | 10 buyruq yo'q | 11 konfiguratsiya | 12 qulf | 60 backup yaroqsiz |
#                  61 ruxsat berilmadi | 62 restore xatosi | 63 restore'dan keyingi tekshiruv ogohlantirishi
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() { sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }

BACKUP_DIR="" TARGET_DB="" TARGET_UPLOADS="" DO_DB=1 DO_UPLOADS=1 OVERWRITE=0 VERIFY_ONLY=0
[[ $# -ge 1 ]] || usage
BACKUP_DIR="$1"; shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) TARGET_DB="${2:-}"; shift 2 ;;
    --uploads-dir) TARGET_UPLOADS="${2:-}"; shift 2 ;;
    --db-only) DO_UPLOADS=0; shift ;;
    --uploads-only) DO_DB=0; shift ;;
    --overwrite-existing) OVERWRITE=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    -h|--help) usage ;;
    *) err "Noma'lum argument: $1"; usage ;;
  esac
done

# Konfiguratsiya ixtiyoriy shu yerda, lekin production nomlarini bilish uchun kerak (bo'lmasa — ogohlantirish).
PROD_DBS=""; PROD_UPLOADS=""
CFG="${IZLAN_BACKUP_CONFIG:-/etc/izlan-backup/backup.env}"
if [[ -f "$CFG" ]]; then
  load_config
  PROD_DBS="${IZLAN_DB_NAME:-} ${IZLAN_PRODUCTION_DB:-}"
  PROD_UPLOADS="${IZLAN_UPLOADS_DIR:-}"
  LOG_FILE="${IZLAN_LOG_FILE:-}"
else
  warn "Konfiguratsiya topilmadi ($CFG): production nomlari noma'lum — ehtiyot bo'ling, faqat yangi nomlarga tiklang"
fi

need_cmd tar; need_cmd gzip; need_cmd sha256sum
[[ -d "$BACKUP_DIR" ]] || die 60 "Backup papkasi yo'q: $BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

# ---- 1) Backup yaxlitligi (har doim, yozishdan oldin) ----
[[ -f "$BACKUP_DIR/COMPLETE" ]] || die 60 "Backup tugallanmagan (COMPLETE yo'q): $BACKUP_DIR"
( cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) || die 60 "SHA256SUMS mos kelmadi: backup buzilgan"
gzip -t "$BACKUP_DIR/uploads.tar.gz" || die 60 "uploads.tar.gz buzilgan"
meta() { sed -n "s/^$1=//p" "$BACKUP_DIR/META.txt" | head -n1; }
info "Backup yaxlitligi OK: $(basename "$BACKUP_DIR") (yaratilgan $(meta created_at), DB '$(meta db_name)')"
if (( VERIFY_ONLY )); then
  if (( DO_DB )); then need_cmd pg_restore; pg_restore --list "$BACKUP_DIR/db.dump" >/dev/null || die 60 "db.dump o'qilmadi"; fi
  info "--verify-only: hech narsa tiklanmadi"; exit 0
fi

# ---- 2) Maqsadlarni tekshirish ----
is_in() { local x="$1" l="$2" i; for i in $l; do [[ -n "$i" && "$i" == "$x" ]] && return 0; done; return 1; }
canon() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }
norm_dir() { local p="$1"; [[ -d "$p" ]] && canon "$p" || printf '%s' "$p"; }

(( DO_DB )) && [[ -z "$TARGET_DB" ]] && { err "--db <nom> kerak (yoki --uploads-only)"; usage; }
(( DO_UPLOADS )) && [[ -z "$TARGET_UPLOADS" ]] && { err "--uploads-dir <papka> kerak (yoki --db-only)"; usage; }

NEED_PROD_PHRASE=""     # production'ga tegsa — to'ldiriladi
NEED_OVERWRITE=0
DB_EXISTS=0

if (( DO_DB )); then
  need_cmd pg_restore; need_cmd psql; need_cmd createdb
  [[ "$TARGET_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die 2 "DB nomi noto'g'ri: $TARGET_DB"
  [[ "$TARGET_DB" != "postgres" && "$TARGET_DB" != template* ]] || die 61 "Tizim bazasiga tiklash taqiqlangan: $TARGET_DB"
  if [[ "$(psql -d postgres -Atc "select 1 from pg_database where datname='$TARGET_DB'" 2>/dev/null || true)" == "1" ]]; then
    DB_EXISTS=1; NEED_OVERWRITE=1
  fi
  if is_in "$TARGET_DB" "$PROD_DBS"; then NEED_PROD_PHRASE="RESTORE-PRODUCTION $TARGET_DB"; NEED_OVERWRITE=1; fi
fi

if (( DO_UPLOADS )); then
  tdir="$(norm_dir "$TARGET_UPLOADS")"
  if [[ -d "$tdir" ]] && [[ -n "$(ls -A "$tdir" 2>/dev/null)" ]]; then NEED_OVERWRITE=1; fi
  if [[ -n "$PROD_UPLOADS" ]] && [[ "$tdir" == "$(norm_dir "$PROD_UPLOADS")" ]]; then
    NEED_PROD_PHRASE="${NEED_PROD_PHRASE:-RESTORE-PRODUCTION uploads}"; NEED_OVERWRITE=1
  fi
fi

# ---- 3) Ruxsat darvozasi ----
if (( NEED_OVERWRITE )) && (( ! OVERWRITE )); then
  die 61 "Maqsad allaqachon mavjud/bo'sh emas yoki production. Yangi nom bering yoki (ongli ravishda) --overwrite-existing qo'shing. HECH NARSA O'ZGARTIRILMADI."
fi
if [[ -n "$NEED_PROD_PHRASE" ]]; then
  if [[ ! -t 0 || ! -t 2 ]]; then
    die 61 "PRODUCTION'ga tiklash faqat interaktiv terminalda, qo'lda tasdiq bilan mumkin (cron/pipe/skript orqali emas). HECH NARSA O'ZGARTIRILMADI."
  fi
  warn "DIQQAT: bu PRODUCTION ma'lumotlarini O'CHIRIB ustiga yozadi. Avval backup.sh ni ishga tushirib, yangi nusxa oling."
  printf 'Davom etish uchun aynan shuni yozing: %s\n> ' "$NEED_PROD_PHRASE" >&2
  read -r answer </dev/tty || answer=""
  [[ "$answer" == "$NEED_PROD_PHRASE" ]] || die 61 "Tasdiq mos kelmadi. HECH NARSA O'ZGARTIRILMADI."
fi

LOCK_ROOT="${IZLAN_BACKUP_ROOT:-/var/backups/izlan}"
[[ -d "$LOCK_ROOT" ]] && acquire_lock "$LOCK_ROOT/.backup.lock"

# ---- 4) DB ----
if (( DO_DB )); then
  if (( DB_EXISTS )); then
    info "Mavjud DB ustiga tiklanmoqda: $TARGET_DB (--clean --if-exists, bitta tranzaksiya)"
    pg_restore -d "$TARGET_DB" --no-owner --clean --if-exists --single-transaction --exit-on-error "$BACKUP_DIR/db.dump" \
      || die 62 "pg_restore muvaffaqiyatsiz (tranzaksiya qaytarildi)"
  else
    info "Yangi DB yaratilmoqda: $TARGET_DB"
    createdb "$TARGET_DB" || die 62 "createdb muvaffaqiyatsiz"
    pg_restore -d "$TARGET_DB" --no-owner --exit-on-error "$BACKUP_DIR/db.dump" \
      || die 62 "pg_restore muvaffaqiyatsiz (yangi DB '$TARGET_DB' to'liq emas — uni o'zingiz o'chiring: dropdb $TARGET_DB)"
  fi
fi

# ---- 5) uploads ----
if (( DO_UPLOADS )); then
  mkdir -p "$TARGET_UPLOADS"
  info "uploads ochilmoqda: $TARGET_UPLOADS (mavjud fayllar o'chirilmaydi, faqat ustiga yoziladi)"
  tar -xzf "$BACKUP_DIR/uploads.tar.gz" -C "$TARGET_UPLOADS" || die 62 "tar ochish muvaffaqiyatsiz"
fi

# ---- 6) Restore'dan keyingi tekshiruvlar ----
WARN_COUNT=0
if (( DO_DB )); then
  while IFS='=' read -r k v; do
    [[ "$k" == rows.* ]] || continue
    t="${k#rows.}"; before="${v%,*}"; after="${v#*,}"
    got="$(psql -d "$TARGET_DB" -Atc "select count(*) from \"$t\"" 2>/dev/null || echo -1)"
    lo=$before; hi=$after; (( lo > hi )) && { lo=$after; hi=$before; }
    if (( got >= lo && got <= hi )) && (( got >= 0 )); then info "tekshiruv OK: $t = $got (backup vaqtida $before..$after)"
    else warn "tekshiruv MOS EMAS: $t = $got, kutilgan $before..$after"; WARN_COUNT=$((WARN_COUNT+1)); fi
  done <"$BACKUP_DIR/META.txt"
fi
if (( DO_UPLOADS )); then
  n="$(find "$TARGET_UPLOADS" -type f | wc -l | tr -d ' ')"
  exp="$(meta uploads_files)"
  if (( n >= exp )); then info "tekshiruv OK: uploads fayllari = $n (arxivda $exp)"
  else warn "tekshiruv MOS EMAS: uploads fayllari = $n, arxivda $exp"; WARN_COUNT=$((WARN_COUNT+1)); fi
fi
(( WARN_COUNT == 0 )) || die 63 "Restore tugadi, lekin $WARN_COUNT ta tekshiruv ogohlantirishi bor — natijani qo'lda ko'rib chiqing"
info "=== Restore muvaffaqiyatli ==="
