#!/bin/sh
# ==============================================================================
# SarayaERP — Offline Backup & Archive Integrity Verifier
# Checks SHA-256 checksums and gzip/tar archive integrity without network access.
# Usage:
#   ./scripts/verify-backup.sh                         # verifies latest in /backups
#   ./scripts/verify-backup.sh /backups/file.sql.gz    # verifies a specific file
# ==============================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
    TARGET=$(ls -1t "${BACKUP_DIR}"/saraya_backup_*.sql.gz 2>/dev/null | head -n 1 || true)
    if [ -z "$TARGET" ]; then
        echo "ERROR: No saraya_backup_*.sql.gz archive found in ${BACKUP_DIR}" >&2
        exit 1
    fi
fi

if [ ! -f "$TARGET" ]; then
    echo "ERROR: Backup file not found: $TARGET" >&2
    exit 1
fi

echo "Verifying backup archive: $TARGET"

if [ -f "${TARGET}.sha256" ]; then
    DIR_NAME=$(dirname "$TARGET")
    BASE_NAME=$(basename "$TARGET")
    (cd "$DIR_NAME" && sha256sum -c "${BASE_NAME}.sha256")
    echo "PASS: SHA-256 checksum verified"
else
    echo "WARN: Checksum file missing (${TARGET}.sha256); checking archive stream only"
fi

gzip -t "$TARGET"
echo "PASS: gzip SQL backup archive stream valid"

UPLOADS_ARCHIVE=""
case "$(basename "$TARGET")" in
    saraya_backup_*.sql.gz)
        STAMP=$(basename "$TARGET" | sed 's/^saraya_backup_//; s/\.sql\.gz$//')
        CANDIDATE="$(dirname "$TARGET")/saraya_uploads_${STAMP}.tar.gz"
        if [ -f "$CANDIDATE" ]; then
            UPLOADS_ARCHIVE="$CANDIDATE"
        fi
        ;;
esac

if [ -n "$UPLOADS_ARCHIVE" ]; then
    echo "Verifying matching uploads archive: $UPLOADS_ARCHIVE"
    if [ -f "${UPLOADS_ARCHIVE}.sha256" ]; then
        DIR_NAME=$(dirname "$UPLOADS_ARCHIVE")
        BASE_NAME=$(basename "$UPLOADS_ARCHIVE")
        (cd "$DIR_NAME" && sha256sum -c "${BASE_NAME}.sha256")
        echo "PASS: Uploads SHA-256 checksum verified"
    fi
    tar -tzf "$UPLOADS_ARCHIVE" >/dev/null
    echo "PASS: Uploads tar.gz archive valid"
fi

echo "ALL BACKUP INTEGRITY CHECKS PASSED"
