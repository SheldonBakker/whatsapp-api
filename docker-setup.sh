#!/bin/bash

# Create required directories for Docker volumes
mkdir -p sessions .wwebjs_auth .cache/puppeteer

# Set proper permissions
chmod -R 777 sessions .wwebjs_auth .cache

echo "Created directories for Docker volumes:"
echo "- sessions (for WhatsApp session data)"
echo "- .wwebjs_auth (for WhatsApp Web authentication)"
echo "- .cache/puppeteer (for Puppeteer cache)"
echo ""
echo "You can now run: docker-compose up -d"
