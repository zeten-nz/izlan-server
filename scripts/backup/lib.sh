#!/usr/bin/env bash
# Izlan backup/restore: umumiy yordamchilar. Bu fayl `source` qilinadi, alohida ishga tushirilmaydi.
# Parollar bu yerda ham, logda ham chiqarilmaydi (PGPASSFILE ishlatiladi).

set -Eeuo pipefail

LOG_FILE="${LOG_FILE:-}"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() {
  local lvl="$1"; shift
  local line
  line="$(ts) [$lvl] $*"
  printf '%s\n' "$line" >&2
  if [[ -n "$LOG_FILE" ]]; then printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true; fi
}
info() { log INFO "$@"; }
warn() { log WARN "$@"; }
err() { log ERROR "$@"; }

# die <exit-code> <xabar>
die() {
  local code="$1"; shift
  err "$*"
  exit "$code"
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || die 10 "Kerakli buyruq topilmadi: $1"; }

# Konfiguratsiya (KEY=VALUE) faylini yuklaydi.
load_config() {
  local f="${IZLAN_BACKUP_CONFIG:-/etc/izlan-backup/backup.env}"
  [[ -f "$f" ]] || die 11 "Konfiguratsiya fayli yo'q: $f (backup.env.example dan nusxa oling)"
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

require_vars() {
  local v
  for v in "$@"; do [[ -n "${!v:-}" ]] || die 11 "Konfiguratsiyada $v belgilanmagan"; done
}

# Bir vaqtda ikki jarayon ishlamasligi uchun qulf (flock bo'lmasa mkdir qulfi).
acquire_lock() {
  local lockfile="$1"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$lockfile"
    flock -n 9 || die 12 "Boshqa backup/restore hozir ishlayapti ($lockfile)"
  else
    LOCK_DIR="$lockfile.d"
    mkdir "$LOCK_DIR" 2>/dev/null || die 12 "Boshqa jarayon ishlayapti yoki oldingi ishga tushirish to'xtab qolgan ($LOCK_DIR)"
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
  fi
}

# Bo'sh joy (MB) <yo'l> uchun
free_mb() { df -Pk "$1" | awk 'NR==2{print int($4/1024)}'; }

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

# Faqat <base> ichidagi yo'lni o'chiradi (xato yo'l bilan keng o'chirishdan himoya)
safe_rm_tree() {
  local base="$1" target="$2"
  [[ -n "$base" && -n "$target" && "$target" == "$base"/* ]] || { warn "safe_rm_tree: '$target' '$base' ichida emas, o'chirilmadi"; return 0; }
  [[ -d "$target" ]] && rm -rf -- "$target"
  return 0
}

# Backup nomi: 20260101T030000Z
BACKUP_NAME_RE='^[0-9]{8}T[0-9]{6}Z$'

# Faqat TUGALLANGAN backup papkalari (COMPLETE belgisi bor), eskidan yangiga.
list_complete_backups() {
  local root="$1" d
  for d in "$root"/*/; do
    d="${d%/}"
    [[ -d "$d" && "$(basename "$d")" =~ $BACKUP_NAME_RE && -f "$d/COMPLETE" ]] && printf '%s\n' "$d"
  done | LC_ALL=C sort
}
