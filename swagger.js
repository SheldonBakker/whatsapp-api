const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0', autoBody: false })

const outputFile = './swagger.json'
const endpointsFiles = ['./src/routes.js']

const doc = {
  info: {
    title: 'WhatsApp API',
    description: 'Basic Whatsapp API',
    version: '1.0.0',
    contact: {
      name: 'API Support',
      url: 'https://github.com/SheldonBakker/whatsapp-api/issues'
    }
  },
  servers: [], // Empty array to hide servers section
  securityDefinitions: {
    apiKeyAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key'
    }
  },
  produces: ['application/json'],
  tags: [
    {
      name: 'Health',
      description: 'Health check endpoints to verify API status'
    },
    {
      name: 'Session',
      description: 'Manage WhatsApp Web sessions'
    },
    {
      name: 'Client',
      description: 'Core WhatsApp client operations'
    },
    {
      name: 'Message',
      description: 'Operations related to WhatsApp messages'
    }
  ],
  definitions: {
    StartSessionResponse: {
      success: true,
      message: 'Session initiated successfully'
    },
    StatusSessionResponse: {
      success: true,
      state: 'CONNECTED',
      message: 'session_connected'
    },
    RestartSessionResponse: {
      success: true,
      message: 'Restarted successfully'
    },
    TerminateSessionResponse: {
      success: true,
      message: 'Logged out successfully'
    },
    TerminateSessionsResponse: {
      success: true,
      message: 'Flush completed successfully'
    },
    ErrorResponse: {
      success: false,
      error: 'Error message'
    },
    NotFoundResponse: {
      success: false,
      error: 'Resource not found'
    },
    ForbiddenResponse: {
      success: false,
      error: 'Invalid API key'
    }
  }
}

swaggerAutogen(outputFile, endpointsFiles, doc)
