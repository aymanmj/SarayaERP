#!/bin/bash

# ==============================================================================
# Saraya Medical ERP - Blue/Green Deployment Script (Zero-Downtime)
# ==============================================================================
# This script manages zero-downtime updates switching between Blue and Green 
# environments using Docker Compose and NGINX reloading.
# ==============================================================================

set -e

# Configuration
SERVICE_NAME="saraya-backend"
NGINX_CONTAINER="saraya-nginx"
COMPOSE_FILE="docker-compose.production.yml"
MAX_START_WAIT_SECONDS=60

# Determine active color (Blue or Green)
if docker ps | grep -q "${SERVICE_NAME}-blue"; then
    ACTIVE="blue"
    IDLE="green"
    ACTIVE_PORT=3001
    IDLE_PORT=3002
else
    ACTIVE="green"
    IDLE="blue"
    ACTIVE_PORT=3002
    IDLE_PORT=3001
fi

echo "==============================================="
echo "Starting Blue/Green Zero-Downtime Deployment"
echo "Current Active Environment : $ACTIVE (Port: $ACTIVE_PORT)"
echo "Target Idle Environment  : $IDLE (Port: $IDLE_PORT)"
echo "==============================================="

# 1. Pull latest images
echo "[1/4] Pulling latest Docker image updates..."
docker-compose -f $COMPOSE_FILE pull "${SERVICE_NAME}-${IDLE}"

# 2. Start the IDLE environment
echo "[2/4] Starting the IDLE environment ($IDLE)..."
docker-compose -f $COMPOSE_FILE up -d --build "${SERVICE_NAME}-${IDLE}"

# Wait for IDLE container health check
echo "Waiting for $IDLE environment to become healthy..."
attempts=0
until docker inspect --format "{{json .State.Health.Status }}" "${SERVICE_NAME}-${IDLE}" | grep -q '\"healthy\"'; do
    sleep 5
    attempts=$((attempts+1))
    if [ $attempts -ge $((MAX_START_WAIT_SECONDS/5)) ]; then
        echo "❌ Deployment Failed: $IDLE environment failed to report 'healthy' within $MAX_START_WAIT_SECONDS seconds."
        echo "Reverting container. The system is still running on $ACTIVE."
        docker-compose -f $COMPOSE_FILE stop "${SERVICE_NAME}-${IDLE}"
        exit 1
    fi
done
echo "✅ $IDLE environment is up and healthy!"

# 3. Switch NGINX to point to the new environment
echo "[3/4] Switching NGINX traffic to $IDLE..."
# Replace the backend port in the NGINX upstream conf (assumes upstream named 'backend')
docker exec $NGINX_CONTAINER sed -i "s/server ${SERVICE_NAME}-${ACTIVE}:${ACTIVE_PORT};/server ${SERVICE_NAME}-${IDLE}:${IDLE_PORT};/g" /etc/nginx/conf.d/default.conf

# Reload NGINX without dropping connections
docker exec $NGINX_CONTAINER nginx -s reload
echo "✅ Traffic successfully routed to the $IDLE environment!"

# 4. Graceful shutdown of old environment
echo "[4/4] Tearing down the old $ACTIVE environment..."
docker-compose -f $COMPOSE_FILE stop "${SERVICE_NAME}-${ACTIVE}"

echo "==============================================="
echo "🎉 Deployment Successful! The system is now running on $IDLE"
echo "==============================================="
