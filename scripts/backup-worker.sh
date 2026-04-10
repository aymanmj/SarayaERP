#!/bin/bash
# ============================================
# Saraya ERP - Backup Worker v2.0
# يراقب ملفات trigger من Backend وينفذ النسخ/الاستعادة
# يدعم النسخ المزدوج (أساسي + ثانوي)
# ============================================

set -e

BACKUP_DIR="/backups"
TRIGGER_BACKUP="${BACKUP_DIR}/trigger_backup"
TRIGGER_RESTORE="${BACKUP_DIR}/trigger_restore"
STATUS_FILE="${BACKUP_DIR}/worker_status.json"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# محاولة تثبيت jq إذا لم يكن موجوداً (لقراءة JSON)
if ! command -v jq &> /dev/null; then
    apk add --no-cache jq 2>/dev/null || true
fi

log "عامل النسخ الاحتياطي v2.0 — يراقب ${BACKUP_DIR}..."

# تحديث الحالة إلى جاهز
echo '{"status": "idle", "message": "Worker ready"}' > "$STATUS_FILE"

while true; do
    # ========================================
    # 1. فحص trigger النسخ الاحتياطي
    # ========================================
    if [ -f "$TRIGGER_BACKUP" ]; then
        log "⚠️ تم اكتشاف طلب نسخ احتياطي!"
        
        TRIGGER_CONTENT=$(cat "$TRIGGER_BACKUP" 2>/dev/null | tr -d '\n')
        rm -f "$TRIGGER_BACKUP"

        # محاولة قراءة JSON (مسار أساسي + ثانوي)
        PRIMARY_PATH=""
        SECONDARY_PATH=""

        # محاولة 1: استخدام jq (إن وُجد)
        if command -v jq &>/dev/null && echo "$TRIGGER_CONTENT" | jq . >/dev/null 2>&1; then
            PRIMARY_PATH=$(echo "$TRIGGER_CONTENT" | jq -r '.primaryPath // empty')
            SECONDARY_PATH=$(echo "$TRIGGER_CONTENT" | jq -r '.secondaryPath // empty')
        # محاولة 2: استخدام sed (fallback بدون jq)
        elif echo "$TRIGGER_CONTENT" | grep -q '"primaryPath"'; then
            PRIMARY_PATH=$(echo "$TRIGGER_CONTENT" | sed -n 's/.*"primaryPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
            SECONDARY_PATH=$(echo "$TRIGGER_CONTENT" | sed -n 's/.*"secondaryPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        else
            # المحتوى نص عادي (backward compatibility)
            PRIMARY_PATH="$TRIGGER_CONTENT"
        fi

        # قيمة افتراضية
        if [ -z "$PRIMARY_PATH" ]; then
            PRIMARY_PATH="$BACKUP_DIR"
        fi

        # تحديد ما إذا كان نسخاً مزدوجاً
        if [ -n "$SECONDARY_PATH" ] && [ "$SECONDARY_PATH" != "null" ]; then
            log "📂 نسخ مزدوج — أساسي: ${PRIMARY_PATH} | ثانوي: ${SECONDARY_PATH}"
            echo "{\"status\": \"busy\", \"operation\": \"backup\", \"message\": \"جاري النسخ المزدوج...\"}" > "$STATUS_FILE"
            
            # النسخ الأساسي
            BACKUP_OK=true
            if /opt/saraya-erp/scripts/backup.sh "$PRIMARY_PATH"; then
                log "✅ النسخ الأساسي تم بنجاح: ${PRIMARY_PATH}"
            else
                log "❌ فشل النسخ الأساسي"
                BACKUP_OK=false
            fi

            # النسخ الثانوي
            SECONDARY_OK=true
            if /opt/saraya-erp/scripts/backup.sh "$SECONDARY_PATH"; then
                log "✅ النسخ الثانوي تم بنجاح: ${SECONDARY_PATH}"
            else
                log "⚠️ فشل النسخ الثانوي (القرص الخارجي قد لا يكون متصلاً)"
                SECONDARY_OK=false
            fi

            # تحديث الحالة
            if $BACKUP_OK; then
                if $SECONDARY_OK; then
                    echo "{\"status\": \"idle\", \"lastResult\": \"success\", \"lastOperation\": \"backup\", \"message\": \"تم النسخ المزدوج بنجاح\", \"primaryPath\": \"${PRIMARY_PATH}\", \"secondaryPath\": \"${SECONDARY_PATH}\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
                else
                    echo "{\"status\": \"idle\", \"lastResult\": \"success\", \"lastOperation\": \"backup\", \"message\": \"تم النسخ الأساسي فقط — فشل القرص الخارجي\", \"primaryPath\": \"${PRIMARY_PATH}\", \"secondaryFailed\": true, \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
                fi
            else
                echo "{\"status\": \"idle\", \"lastResult\": \"error\", \"lastOperation\": \"backup\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
            fi

        else
            # نسخ عادي (مسار واحد)
            log "📂 نسخ عادي — المسار: ${PRIMARY_PATH}"
            echo "{\"status\": \"busy\", \"operation\": \"backup\", \"message\": \"جاري النسخ الاحتياطي إلى ${PRIMARY_PATH}...\"}" > "$STATUS_FILE"
            
            if /opt/saraya-erp/scripts/backup.sh "$PRIMARY_PATH"; then
                echo "{\"status\": \"idle\", \"lastResult\": \"success\", \"lastOperation\": \"backup\", \"targetPath\": \"${PRIMARY_PATH}\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
                log "✅ تم النسخ الاحتياطي بنجاح"
            else
                echo "{\"status\": \"idle\", \"lastResult\": \"error\", \"lastOperation\": \"backup\", \"targetPath\": \"${PRIMARY_PATH}\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
                log "❌ فشل النسخ الاحتياطي"
            fi
        fi
    fi

    # ========================================
    # 2. فحص trigger الاستعادة
    # ========================================
    if [ -f "$TRIGGER_RESTORE" ]; then
        log "⚠️ تم اكتشاف طلب استعادة!"
        
        RESTORE_PATH=$(cat "$TRIGGER_RESTORE" 2>/dev/null | tr -d '\n')
        rm -f "$TRIGGER_RESTORE"
        
        if [ -z "$RESTORE_PATH" ]; then
             log "خطأ: ملف trigger الاستعادة فارغ"
             continue
        fi

        # التحقق من وجود الملف
        if [ ! -f "$RESTORE_PATH" ]; then
            log "خطأ: الملف غير موجود: ${RESTORE_PATH}"
            echo "{\"status\": \"idle\", \"lastResult\": \"error\", \"lastOperation\": \"restore\", \"message\": \"الملف غير موجود\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
            continue
        fi

        FILENAME=$(basename "$RESTORE_PATH")
        log "📂 ملف الاستعادة: ${RESTORE_PATH}"
        echo "{\"status\": \"busy\", \"operation\": \"restore\", \"message\": \"جاري استعادة ${FILENAME}...\"}" > "$STATUS_FILE"
        
        if /opt/saraya-erp/scripts/restore.sh "$RESTORE_PATH"; then
            echo "{\"status\": \"idle\", \"lastResult\": \"success\", \"lastOperation\": \"restore\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
            log "✅ تمت الاستعادة بنجاح"
        else
            echo "{\"status\": \"idle\", \"lastResult\": \"error\", \"lastOperation\": \"restore\", \"timestamp\": \"$(date +%s)\"}" > "$STATUS_FILE"
            log "❌ فشلت الاستعادة"
        fi
    fi

    sleep 5
done
