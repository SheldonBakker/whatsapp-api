# Docker Setup for WhatsApp API

This document provides comprehensive instructions for running the WhatsApp API using Docker with optimized Chrome/Puppeteer configuration and session recovery capabilities.

## Prerequisites

- Docker and Docker Compose installed on your system
- At least 4GB RAM available for the container
- Basic understanding of Docker concepts

## Quick Start

1. **Prepare the environment:**
   ```bash
   # On Linux/Mac
   chmod +x docker-setup.sh
   ./docker-setup.sh

   # On Windows (use Git Bash or WSL)
   bash docker-setup.sh
   ```

2. **Configure environment variables:**
   ```bash
   # Use the Docker-optimized environment file
   cp .env.docker .env
   # Edit .env file with your preferred settings if needed
   ```

3. **Build and start the containers:**
   ```bash
   # Build and start in detached mode
   docker-compose up -d --build

   # Or start with logs visible
   docker-compose up --build
   ```

4. **Verify the service is running:**
   ```bash
   # Check container status
   docker-compose ps

   # Check health status
   curl http://localhost:5656/health
   ```

5. **Access the API:**
   - API Base URL: http://localhost:5656
   - Swagger Documentation: http://localhost:5656/api-docs
   - Health Check: http://localhost:5656/health

## Configuration

You can configure the application by:

1. Editing the `.env` file (recommended)
2. Directly modifying environment variables in the `docker-compose.yml` file

### Important Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5656` |
| `API_KEY` | Global API key for authentication | Sample key (change in production) |
| `BASE_WEBHOOK_URL` | Base URL for webhooks | `http://host.docker.internal:5656/callback` |
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
   curl -X POST "http://localhost:5656/api/session/session1/start" -H "x-api-key: YOUR_API_KEY"
   ```

2. Get the QR code to scan:
   ```bash
   curl -X GET "http://localhost:5656/api/session/session1/qr" -H "x-api-key: YOUR_API_KEY"
   ```

   Or visit `http://localhost:5656/api/session/session1/qr-scan` in your browser.

3. Check session status:
   ```bash
   curl -X GET "http://localhost:5656/api/session/session1/status" -H "x-api-key: YOUR_API_KEY"
   ```

## Accessing the API from Local Network

By default, the Docker Compose configuration binds the API to all network interfaces (`0.0.0.0`), making it accessible from other devices on your local network.

To access the API from another device on your network:

1. Find your host machine's IP address:
   ```bash
   # On Windows
   ipconfig

   # On Linux/Mac
   ifconfig
   # or
   ip addr show
   ```

2. Use this IP address to access the API from other devices:
   ```
   http://YOUR_HOST_IP:5656
   ```

3. For webhook callbacks, you may need to update the `BASE_WEBHOOK_URL` in your `.env` file to use your host machine's IP instead of `localhost` or `host.docker.internal`.

## Session Management

### Creating and Managing Sessions

1. **Create a new session:**
   ```bash
   curl -X GET "http://localhost:5656/session/start/my-session" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2"
   ```

2. **Check session status with enhanced recovery:**
   ```bash
   curl -X GET "http://localhost:5656/session/status-enhanced/my-session" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2"
   ```

3. **Get QR code for scanning:**
   ```bash
   # Get QR as image
   curl -X GET "http://localhost:5656/session/qr/my-session/image" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2" \
     --output qr.png

   # Or visit in browser
   open http://localhost:5656/session/qr/my-session/image
   ```

4. **List all sessions:**
   ```bash
   curl -X GET "http://localhost:5656/session/all" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2"
   ```

### Session Recovery

The API includes automatic session recovery for browser failures:

- **Enhanced Status Endpoint**: `/session/status-enhanced/{sessionId}` automatically detects and recovers from browser issues
- **Automatic Recovery**: Up to 3 recovery attempts with exponential backoff
- **Docker-Optimized**: Handles container-specific browser failures

## Troubleshooting

### Container Won't Start

1. **Check Docker resources:**
   ```bash
   # Ensure Docker has enough memory (4GB+ recommended)
   docker system info
   ```

2. **Check port conflicts:**
   ```bash
   # Make sure port 5656 is not in use
   lsof -i :5656
   netstat -tulpn | grep 5656
   ```

3. **Rebuild with no cache:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Browser/Chrome Issues

1. **Check Chrome installation in container:**
   ```bash
   docker-compose exec whatsapp-api which chromium-browser
   docker-compose exec whatsapp-api chromium-browser --version
   ```

2. **Check browser permissions:**
   ```bash
   docker-compose exec whatsapp-api ls -la /usr/bin/chromium-browser
   ```

3. **View detailed browser logs:**
   ```bash
   # Enable Puppeteer debugging
   docker-compose down
   # Edit .env and set PUPPETEER_DEBUG=TRUE
   docker-compose up
   ```

### Session Recovery Issues

1. **Check session recovery logs:**
   ```bash
   docker-compose logs -f whatsapp-api | grep -i recovery
   ```

2. **Test enhanced status endpoint:**
   ```bash
   curl -v -X GET "http://localhost:5656/session/status-enhanced/test-session" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2"
   ```

3. **Manual session restart:**
   ```bash
   curl -X GET "http://localhost:5656/session/restart/my-session" \
     -H "x-api-key: 0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2"
   ```

### Memory Issues

1. **Check container memory usage:**
   ```bash
   docker stats whatsapp-api
   ```

2. **Increase memory limits in docker-compose.yml:**
   ```yaml
   services:
     whatsapp-api:
       mem_limit: 6g  # Increase from 4g
       shm_size: 3gb  # Increase from 2gb
   ```

### Volume Permission Issues

1. **Fix volume permissions:**
   ```bash
   ./docker-setup.sh
   ```

2. **Manual permission fix:**
   ```bash
   sudo chown -R 1001:1001 sessions .wwebjs_auth .cache logs
   chmod -R 755 sessions .wwebjs_auth .cache logs
   ```

### Network Issues

1. **Check container networking:**
   ```bash
   docker-compose exec whatsapp-api ping google.com
   ```

2. **Check webhook connectivity:**
   ```bash
   # Test webhook endpoint
   curl -X POST "http://localhost:5656/callback" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

### Debugging Commands

1. **Access container shell:**
   ```bash
   docker-compose exec whatsapp-api sh
   ```

2. **View all logs:**
   ```bash
   docker-compose logs -f --tail=100 whatsapp-api
   ```

3. **Check environment variables:**
   ```bash
   docker-compose exec whatsapp-api env | grep -E "(CHROME|PUPPETEER|NODE)"
   ```

4. **Test Chrome manually:**
   ```bash
   docker-compose exec whatsapp-api chromium-browser --version
   docker-compose exec whatsapp-api chromium-browser --headless --dump-dom https://google.com
   ```

## Performance Optimization

### Resource Allocation

- **Memory**: Minimum 4GB, recommended 6GB+
- **CPU**: Minimum 2 cores, recommended 4 cores
- **Storage**: SSD recommended for session data

### Container Optimization

1. **Adjust memory limits:**
   ```yaml
   mem_limit: 6g
   memswap_limit: 6g
   shm_size: 3gb
   ```

2. **CPU limits:**
   ```yaml
   cpus: '4.0'
   ```

3. **Use named volumes for better performance:**
   ```yaml
   volumes:
     - sessions_data:/usr/src/app/sessions
     - auth_data:/usr/src/app/.wwebjs_auth
   ```

## Security Considerations

- **Change default API key** in production
- **Use Docker secrets** for sensitive environment variables
- **Restrict network access** using Docker networks
- **Regular security updates** of base images
- **Monitor container logs** for suspicious activity

## Production Deployment

### Docker Swarm

```yaml
version: '3.8'
services:
  whatsapp-api:
    image: your-registry/whatsapp-api:latest
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 6G
          cpus: '2.0'
        reservations:
          memory: 4G
          cpus: '1.0'
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whatsapp-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: whatsapp-api
  template:
    metadata:
      labels:
        app: whatsapp-api
    spec:
      containers:
      - name: whatsapp-api
        image: your-registry/whatsapp-api:latest
        resources:
          limits:
            memory: "6Gi"
            cpu: "2000m"
          requests:
            memory: "4Gi"
            cpu: "1000m"
```
