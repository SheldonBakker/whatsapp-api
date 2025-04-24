@echo off
REM Create required directories for Docker volumes
mkdir sessions 2>nul
mkdir .wwebjs_auth 2>nul
mkdir .cache\puppeteer 2>nul

echo Created directories for Docker volumes:
echo - sessions (for WhatsApp session data)
echo - .wwebjs_auth (for WhatsApp Web authentication)
echo - .cache\puppeteer (for Puppeteer cache)
echo.
echo You can now run: docker-compose up -d
