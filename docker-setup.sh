#!/bin/bash

# Stop any running containers first
docker-compose down

# Create required directories for Docker volumes if they don't exist
mkdir -p sessions .wwebjs_auth .cache/puppeteer

# Clean up only lock files that might be causing issues
# This preserves all session data while removing only problematic lock files
find .wwebjs_auth -name "SingletonLock" -delete
find .wwebjs_auth -name "SingletonCookie" -delete
find .wwebjs_auth -name "Singleton*" -delete
find .cache -name "SingletonLock" -delete
find .cache -name "SingletonCookie" -delete
find .cache -name "Singleton*" -delete

# Create puppeteer_chrome_profile directories in each session folder if they don't exist
for dir in .wwebjs_auth/session-*; do
  if [ -d "$dir" ]; then
    mkdir -p "$dir/puppeteer_chrome_profile"
    echo "Ensured Chrome profile directory exists: $dir/puppeteer_chrome_profile"
  fi
done

# Set proper permissions while preserving existing files
chmod -R 777 sessions .wwebjs_auth .cache

echo "Fixed permissions and cleaned up lock files for Docker volumes:"
echo "- sessions (for WhatsApp session data)"
echo "- .wwebjs_auth (for WhatsApp Web authentication)"
echo "- .cache/puppeteer (for Puppeteer cache)"
echo ""
echo "IMPORTANT: Your WhatsApp session data has been preserved."
echo "You can now run: docker-compose up -d --build"
