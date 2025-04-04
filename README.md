# WhatsApp REST API

A powerful REST API wrapper for the [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) library, providing an easy-to-use interface to interact with the WhatsApp Web platform. This project is designed to be used as a Docker container, making it scalable, secure, and easy to integrate with other non-NodeJS projects.

![GitHub stars](https://img.shields.io/github/stars/SheldonBakker/whatsapp-api?style=social)
![GitHub forks](https://img.shields.io/github/forks/SheldonBakker/whatsapp-api?style=social)
![GitHub issues](https://img.shields.io/github/issues/SheldonBakker/whatsapp-api)
![GitHub license](https://img.shields.io/github/license/SheldonBakker/whatsapp-api)

## ⚠️ Disclaimer

**NOTE**: This project is not affiliated with WhatsApp or Meta. I can't guarantee you will not be blocked by using this method, although it has worked for me. WhatsApp does not allow bots or unofficial clients on their platform, so this shouldn't be considered totally safe.

## ✨ Features

- 🌐 RESTful API for WhatsApp Web functionality
- 🔄 Multiple concurrent sessions support
- 🐳 Docker-ready for easy deployment
- 📱 Send and receive messages, media, and more
- 👥 Manage groups, contacts, and chats
- 🪝 Webhook integration for real-time events
- 🔐 API key authentication
- 📚 Swagger documentation
- ⚡ Rate limiting for protection
- 🖼️ Media support (images, documents, voice notes, etc.)

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher) for local development
- Docker and Docker Compose (for containerized deployment)
- A device to scan WhatsApp QR code

### Installation

#### Using Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/SheldonBakker/whatsapp-api.git
   cd whatsapp-api
   ```

2. Configure environment variables (see Configuration section below):
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. The API will be available at http://localhost:3000

#### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/SheldonBakker/whatsapp-api.git
   cd whatsapp-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

4. Start the server:
   ```bash
   npm start
   ```

## 🔧 Configuration

The application can be configured using environment variables. Create a `.env` file in the root directory or set them in your Docker Compose file.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `API_KEY` | Global API key for authentication | None |
| `BASE_WEBHOOK_URL` | Base URL for webhooks (required) | None |
| `ENABLE_LOCAL_CALLBACK_EXAMPLE` | Enable example callback (disable in production) | `FALSE` |
| `MAX_ATTACHMENT_SIZE` | Maximum attachment size in bytes | `10000000` |
| `SET_MESSAGES_AS_SEEN` | Auto-mark messages as read | `FALSE` |
| `DISABLED_CALLBACKS` | Prevent sending specific callbacks | None |
| `ENABLE_SWAGGER_ENDPOINT` | Enable Swagger docs at /api-docs | `TRUE` |
| `RATE_LIMIT_MAX` | Max requests per time frame | `1000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `1000` |
| `WEB_VERSION` | WhatsApp Web version | `2.2328.5` |
| `WEB_VERSION_CACHE_TYPE` | Source for WhatsApp Web version | `none` |
| `RECOVER_SESSIONS` | Recover session on page failure | `TRUE` |
| `SESSIONS_PATH` | Path to store session files | `./sessions` |

## 📖 Usage

### Creating a Session

To use this API, you first need to create a WhatsApp session:

1. Make a GET request to `/session/start/{sessionId}` where `sessionId` is a unique identifier for your session
2. Get the QR code by requesting `/session/qr/{sessionId}/image`
3. Scan the QR code with your WhatsApp mobile app
4. Check session status with `/session/status/{sessionId}`

### Sending a Message

Once your session is connected, you can send a message:

```http
POST /client/sendMessage/{sessionId}
Content-Type: application/json
x-api-key: your-api-key

{
  "chatId": "123456789@c.us",
  "contentType": "string",
  "content": "Hello from WhatsApp API!"
}
```

### API Documentation

When the server is running, you can access the full Swagger documentation at:
http://localhost:3000/api-docs

## 📊 Available Endpoints

The API provides endpoints for various WhatsApp functionalities:

### Session Management
- Create, check status, and terminate sessions
- Get QR code for authentication

### Messaging
- Send text messages
- Send media (images, documents, audio)
- Send location, buttons, lists, contacts, polls
- Delete messages

### Chats
- Get chat information
- Clear messages
- Delete chats
- Fetch messages


### Contacts
- Get contact information
- Block/unblock contacts
- Get profile pictures

## 🧰 Examples

### Sending an Image

```http
POST /client/sendMessage/{sessionId}
Content-Type: application/json
x-api-key: your-api-key

{
  "chatId": "123456789@c.us",
  "contentType": "MessageMedia",
  "content": {
    "mimetype": "image/jpeg",
    "data": "base64-encoded-data",
    "filename": "image.jpg"
  }
}
```

## 📱 Webhook Integration

This API can send webhooks for various WhatsApp events. Configure the `BASE_WEBHOOK_URL` environment variable to receive notifications about:
- New messages
- QR code refreshes
- Session updates
- And more

## 🛠️ Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - The amazing library that makes this project possible
- The open-source community for their continuous support and contributions

## Features

- Multiple independent WhatsApp sessions
- Webhook notifications for various events (messages, status changes, etc.)
- Media handling (send and receive images, documents, etc.)
- Group management
- Session persistence between server restarts
- Customizable per-session configurations

## Setting up Multiple Sessions

Each session can be customized with its own user agent and webhook URL:

### Configure via Environment Variables

Add these to your `.env` file:

```
# Custom user agent for a session named "session1"
SESSION1_USER_AGENT=Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1

# Custom webhook for a session
SESSION1_WEBHOOK_URL=http://localhost:8080/session1-webhook
```

### Create a New Session

```bash
curl -X POST "http://localhost:3000/api/session/session1/start" -H "x-api-key: YOUR_API_KEY"
```

### Get QR Code for Authentication

```bash
curl -X GET "http://localhost:3000/api/session/session1/qr" -H "x-api-key: YOUR_API_KEY"
```

Or visit `http://localhost:3000/api/session/session1/qr-scan` in your browser to scan the QR code.

### Check Session Status

```bash
curl -X GET "http://localhost:3000/api/session/session1/status" -H "x-api-key: YOUR_API_KEY"
```

### List All Sessions

```bash
curl -X GET "http://localhost:3000/api/sessions" -H "x-api-key: YOUR_API_KEY"
```

### Terminate a Session

```bash
curl -X DELETE "http://localhost:3000/api/session/session1" -H "x-api-key: YOUR_API_KEY"
```

## Session Persistence

Sessions are automatically restored when the server restarts. Each session maintains its own data and authentication state independently.

## Troubleshooting

If you encounter issues with sessions not persisting between restarts:

1. Ensure the `.cache/puppeteer` directory exists and is writable
2. Check if the `sessions` directory contains session data
3. Verify that the environment variables are set correctly
4. Restart the server with `npm start`

If a session gets stuck, you can restart it:

```bash
curl -X PUT "http://localhost:3000/api/session/session1/restart" -H "x-api-key: YOUR_API_KEY"
```
