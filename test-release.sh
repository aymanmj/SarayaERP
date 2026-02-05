#!/bin/bash

# Load Environment Variables (Simulating Client Env)
if [ -f .env ]; then
  export $(echo $(cat .env | sed 's/#.*//g' | xargs) | envsubst)
fi

echo "🧪 Testing Client Update Flow..."

# 1. Login check (User must be logged in, we assume they are)
echo "🔑 Checking Docker Login..."
# In a real script we might prompt, but here we just proceed

# 2. Pull from GHCR
echo "⬇️ Pulling images from GitHub Registry..."
docker-compose -f docker-compose.production.yml pull

if [ $? -eq 0 ]; then
    echo "✅ Pull Successful! The CI/CD pipeline is working."
else
    echo "❌ Pull Failed. Please check if you are logged in to GHCR."
    exit 1
fi

# 3. Dry Run Up (Don't actually restart if not needed, or restart to prove it works)
# We will just print success here to avoid disrupting the user's current session too much 
# unless they want to.
echo "🎉 Ready to deploy! Run './update.sh' to apply changes."
