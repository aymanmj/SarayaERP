#!/bin/bash
# ============================================
# Saraya Tunnel Watchdog (Enhanced)
# ============================================
# يراقب حالة Cloudflare Tunnel ويعيد تشغيله عند الحاجة
# يُثبّت كـ cron job: */3 * * * * /opt/saraya-erp/scripts/tunnel-watchdog.sh
#
# المشكلة: عند انقطاع الإنترنت ثم عودته، قد يدخل الـ tunnel
# في حالة zombie حيث العملية تعمل لكن الاتصال مقطوع.
# هذا السكربت يكتشف هذه الحالة ويعيد تشغيل الحاوية.
#
# 🔄 OFFLINE-FIX v2: إضافة كشف zombie أذكى + إعادة تشغيل قسرية

CONTAINER="saraya_tunnel"
LOG_PREFIX="[Saraya Tunnel Watchdog]"
WATCHDOG_LOG="/var/log/saraya-tunnel-watchdog.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') ${LOG_PREFIX} $1" | tee -a "$WATCHDOG_LOG" 2>/dev/null
}

# تحقق: هل الحاوية موجودة أصلاً؟
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log "Container ${CONTAINER} not found. Skipping."
    exit 0
fi

# تحقق: هل الحاوية تعمل؟
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log "Container ${CONTAINER} is not running. Starting..."
    docker start "${CONTAINER}"
    exit 0
fi

# تحقق: هل الإنترنت متاح؟
INTERNET_OK=false
for target in 1.1.1.1 8.8.8.8 9.9.9.9; do
    if ping -c 1 -W 3 "$target" &>/dev/null; then
        INTERNET_OK=true
        break
    fi
done

if [ "$INTERNET_OK" = false ]; then
    log "Internet is down. Tunnel recovery will happen when internet returns."
    exit 0
fi

# ────────────────────────────────────────────
# الإنترنت متاح — تحقق من حالة الـ tunnel
# ────────────────────────────────────────────

RECENT_LOGS=$(docker logs --tail 30 "${CONTAINER}" 2>&1)

# 🟢 حالة 1: الـ tunnel مسجل ويعمل بشكل طبيعي
if echo "${RECENT_LOGS}" | tail -5 | grep -q "Registered tunnel connection"; then
    log "Tunnel is healthy — registered connection found."
    exit 0
fi

# 🔴 حالة 2: أخطاء DNS timeout متكررة (الـ tunnel عالق بعد عودة الإنترنت)
DNS_ERRORS=$(echo "${RECENT_LOGS}" | grep -c "i/o timeout\|context deadline exceeded\|Failed to refresh DNS" 2>/dev/null || echo 0)

if [ "$DNS_ERRORS" -ge 3 ]; then
    log "ZOMBIE DETECTED: ${DNS_ERRORS} DNS timeout errors found. Internet is back but tunnel is stuck. Restarting..."
    docker restart "${CONTAINER}"
    sleep 10

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        log "Tunnel restarted successfully after zombie detection."
    else
        log "ERROR: Tunnel failed to restart after zombie detection!"
        exit 1
    fi
    exit 0
fi

# 🔴 حالة 3: أخطاء اتصال أخرى
if echo "${RECENT_LOGS}" | tail -10 | grep -q "connection refused\|EOF\|handler error\|failed to connect\|no such host"; then
    log "Connection errors detected. Restarting tunnel..."
    docker restart "${CONTAINER}"
    sleep 5

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        log "Tunnel restarted successfully."
    else
        log "ERROR: Tunnel failed to restart!"
        exit 1
    fi
    exit 0
fi

# 🟡 حالة 4: لا أخطاء واضحة لكن لم نرَ تسجيل حديث
# تحقق من آخر تسجيل ناجح
LAST_REGISTERED=$(echo "${RECENT_LOGS}" | grep "Registered tunnel connection" | tail -1)
if [ -z "$LAST_REGISTERED" ]; then
    # لم يتم تسجيل أي اتصال في آخر 30 سطر — قد يكون الـ tunnel بحاجة لإعادة تشغيل
    UPTIME_SECONDS=$(docker inspect --format '{{.State.StartedAt}}' "${CONTAINER}" 2>/dev/null)
    if [ -n "$UPTIME_SECONDS" ]; then
        START_EPOCH=$(date -d "$UPTIME_SECONDS" +%s 2>/dev/null || echo 0)
        NOW_EPOCH=$(date +%s)
        RUNNING_FOR=$(( NOW_EPOCH - START_EPOCH ))
        
        # إذا الحاوية تعمل لأكثر من 10 دقائق بدون تسجيل اتصال
        if [ "$RUNNING_FOR" -gt 600 ]; then
            log "No registered connection found after ${RUNNING_FOR}s uptime. Restarting..."
            docker restart "${CONTAINER}"
            sleep 5
            log "Tunnel restarted (no connection for ${RUNNING_FOR}s)."
            exit 0
        fi
    fi
fi

log "Tunnel appears healthy."
