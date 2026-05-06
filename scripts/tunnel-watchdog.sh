#!/bin/bash
# ============================================
# Saraya Tunnel Watchdog
# ============================================
# يراقب حالة Cloudflare Tunnel ويعيد تشغيله عند الحاجة
# يُثبّت كـ cron job: */5 * * * * /opt/saraya-erp/scripts/tunnel-watchdog.sh
#
# المشكلة: عند انقطاع الإنترنت ثم عودته، قد يدخل الـ tunnel
# في حالة zombie حيث العملية تعمل لكن الاتصال مقطوع.
# هذا السكربت يكتشف هذه الحالة ويعيد تشغيل الحاوية.

CONTAINER="saraya_tunnel"
LOG_PREFIX="[Saraya Tunnel Watchdog]"

# تحقق: هل الحاوية موجودة أصلاً؟
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "${LOG_PREFIX} Container ${CONTAINER} not found. Skipping."
    exit 0
fi

# تحقق: هل الحاوية تعمل؟
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "${LOG_PREFIX} Container ${CONTAINER} is not running. Starting..."
    docker start "${CONTAINER}"
    exit 0
fi

# تحقق: هل الإنترنت متاح؟
if ! ping -c 1 -W 3 1.1.1.1 &>/dev/null; then
    echo "${LOG_PREFIX} Internet is down. Tunnel recovery will happen when internet returns."
    exit 0
fi

# الإنترنت متاح — تحقق من حالة الـ tunnel عبر السجلات
RECENT_LOGS=$(docker logs --tail 20 "${CONTAINER}" 2>&1)

# إذا كانت هناك أخطاء متكررة في الاتصال
if echo "${RECENT_LOGS}" | grep -q "connection refused\|context deadline exceeded\|EOF\|handler error\|failed to connect"; then
    echo "${LOG_PREFIX} Tunnel appears unhealthy. Restarting..."
    docker restart "${CONTAINER}"
    sleep 5
    
    # تحقق من أن الـ restart نجح
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        echo "${LOG_PREFIX} Tunnel restarted successfully."
    else
        echo "${LOG_PREFIX} ERROR: Tunnel failed to restart!"
        exit 1
    fi
else
    echo "${LOG_PREFIX} Tunnel is healthy."
fi
