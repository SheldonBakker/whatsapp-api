# Docker Setup for WhatsApp API

This document provides instructions for running the WhatsApp API using Docker with our refined Docker Compose configuration.

## Prerequisites

- Docker and Docker Compose installed on your system
- Basic understanding of Docker concepts

## Quick Start

1. Run the setup script to create necessary directories:
   ```bash
   # On Windows
   docker-setup.bat

   # On Linux/Mac
   chmod +x docker-setup.sh
   ./docker-setup.sh
   ```

2. Configure environment variables:
   ```bash
   # Use the Docker-optimized environment file
   cp .env.docker .env
   # Edit .env file with your preferred settings
   ```

3. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

4. The API will be available at http://localhost:3000

5. Access the Swagger documentation at http://localhost:3000/api-docs

## Configuration

You can configure the application by:

1. Editing the `.env` file (recommended)
2. Directly modifying environment variables in the `docker-compose.yml` file

### Important Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `API_KEY` | Global API key for authentication | Sample key (change in production) |
| `BASE_WEBHOOK_URL` | Base URL for webhooks | `http://localhost:3000/callback` |
| `CHROME_HEADLESS` | Run Chrome in headless mode | `TRUE` |
| `SESSIONS_PATH` | Path to store session files | `./sessions` |

## Persistent Data

The following directories are mounted as volumes to persist data between container restarts:

- `./sessions`: WhatsApp session data
- `./.wwebjs_auth`: WhatsApp Web authentication data
- `./.cache`: Puppeteer cache

## Running in Non-Headless Mode

By default, the application runs Chrome in headless mode. To run with a visible browser:

1. Edit your `.env` file and set:
   ```
   CHROME_HEADLESS=FALSE
   ```

2. For Linux, uncomment the following lines in `docker-compose.yml`:
   ```yaml
   cap_add:
     - SYS_ADMIN
   devices:
     - /dev/snd:/dev/snd
     - /dev/dri:/dev/dri
   ```

## Multiple Sessions

You can run multiple WhatsApp sessions simultaneously:

1. Create a new session:
   ```bash
   curl -X POST "http://localhost:3000/api/session/session1/start" -H "x-api-key: YOUR_API_KEY"
   ```

2. Get the QR code to scan:
   ```bash
   curl -X GET "http://localhost:3000/api/session/session1/qr" -H "x-api-key: YOUR_API_KEY"
   ```

   Or visit `http://localhost:3000/api/session/session1/qr-scan` in your browser.

3. Check session status:
   ```bash
   curl -X GET "http://localhost:3000/api/session/session1/status" -H "x-api-key: YOUR_API_KEY"
   ```

## Troubleshooting

### QR Code Not Displaying

If you're having trouble with QR code display:

1. Ensure the container has proper permissions to create and write to the mounted volumes
2. Check container logs:
   ```bash
   docker-compose logs -f whatsapp-api
   ```

### Container Crashes

If the container crashes:

1. Check if Chrome can run properly in the container
2. Ensure all required directories exist and have proper permissions
3. Check the logs for specific error messages

## Security Considerations

- The default API key in the example is for demonstration only. Always use a strong, unique API key in production.
- Consider using Docker secrets or a secure environment variable management solution for sensitive data.
- Restrict access to the API endpoint using a reverse proxy with authentication if exposed publicly.
