#!/bin/bash
echo "🚀 Starting System Update..."

# 1. Pull latest images
echo "📥 Pulling latest updates..."
docker-compose -f docker-compose.production.yml pull

# 2. Recreate containers
echo "🔄 Recreating containers..."
docker-compose -f docker-compose.production.yml up -d

# 3. Cleanup unused images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Update Complete!"
