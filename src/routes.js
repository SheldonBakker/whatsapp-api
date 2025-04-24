const express = require('express')
const routes = express.Router()
const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('../swagger.json')
const { enableCallback, enableSwaggerEndpoint } = require('./config')

const middleware = require('./middleware')
const { validate } = require('./middleware') // Import the new validate function
const schemas = require('./utils/validationSchemas') // Import validation schemas
const healthController = require('./controllers/healthController')
const sessionController = require('./controllers/sessionController')
const clientController = require('./controllers/clientController')
const messageController = require('./controllers/messageController')

/**
 * ================
 * HEALTH ENDPOINTS
 * ================
 */

// API endpoint to check if server is alive - no API key required
routes.get('/ping', /* #swagger.tags = ['Health'] */ healthController.ping)

// API basic callback
if (enableCallback) {
  routes.post('/callback', [middleware.apikey, middleware.rateLimiter], /* #swagger.tags = ['Health'] */ healthController.Callback)
}

// Comprehensive health check endpoint - requires API key
routes.get('/health', [middleware.apikey], /* #swagger.tags = ['Health'] */ healthController.healthCheck)

/**
 * ================
 * SESSION ENDPOINTS
 * ================
 */
const sessionRouter = express.Router()
sessionRouter.use(middleware.apikey)
sessionRouter.use(middleware.sessionSwagger)
routes.use('/session', sessionRouter)

// Apply sessionId validation to all routes with :sessionId param
sessionRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

sessionRouter.get('/start/:sessionId', sessionController.startSession) // Validation applied by .use() above
sessionRouter.get('/status/:sessionId', sessionController.statusSession) // Validation applied by .use() above
sessionRouter.get('/qr/:sessionId', sessionController.sessionQrCode) // Validation applied by .use() above
sessionRouter.get('/qr/:sessionId/image', sessionController.sessionQrCodeImage) // Validation applied by .use() above
sessionRouter.get('/restart/:sessionId', sessionController.restartSession) // Validation applied by .use() above
sessionRouter.get('/terminate/:sessionId', sessionController.terminateSession) // Validation applied by .use() above
sessionRouter.get('/terminateInactive', sessionController.terminateInactiveSessions) // No sessionId param
sessionRouter.get('/terminateAll', sessionController.terminateAllSessions) // No sessionId param
sessionRouter.get('/all', sessionController.getAllSessions) // No sessionId param

/**
 * ================
 * CLIENT ENDPOINTS
 * ================
 */

const clientRouter = express.Router()
clientRouter.use(middleware.apikey)
sessionRouter.use(middleware.clientSwagger)
routes.use('/client', clientRouter)

// Apply sessionId validation to all client routes with :sessionId param
clientRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

clientRouter.get('/getClassInfo/:sessionId', [middleware.sessionValidation], clientController.getClassInfo) // Param validation applied by .use()
clientRouter.post('/getNumberId/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.getNumberIdBodySchema, 'body') // Validate request body
], clientController.getNumberId)
clientRouter.get('/getState/:sessionId', clientController.getState) // Param validation applied by .use()
clientRouter.post('/sendMessage/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.sendMessageBodySchema, 'body') // Validate request body
], clientController.sendMessage)
clientRouter.get('/getWWebVersion/:sessionId', [middleware.sessionValidation], clientController.getWWebVersion) // Param validation applied by .use()

/**
 * ================
 * MESSAGE ENDPOINTS
 * ================
 */
const messageRouter = express.Router()
messageRouter.use(middleware.apikey)
messageRouter.use(middleware.messageSwagger) // Apply swagger tag middleware
routes.use('/message', messageRouter)

// Apply sessionId validation to all message routes with :sessionId param
messageRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

messageRouter.post('/delete/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.deleteMessageBodySchema, 'body') // Validate request body
], messageController.deleteMessage)

/**
 * ================
 * SWAGGER ENDPOINTS
 * ================
 */
if (enableSwaggerEndpoint) {
  routes.use('/api-docs', swaggerUi.serve)
  routes.get('/api-docs', swaggerUi.setup(swaggerDocument, {
    customCss: `
      .topbar { display: none }
      .swagger-ui .info { margin: 30px 0 }
      .swagger-ui .scheme-container { background: none; box-shadow: none; padding: 0 }
      .swagger-ui .opblock-tag { border: none; margin: 0 }
      .swagger-ui .opblock { border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.12) }
      .swagger-ui section.models { display: none }
      .swagger-ui .info .title { font-size: 2.5em }
      .swagger-ui .btn { border-radius: 4px }
      .swagger-ui .parameter__name { font-size: 14px }
      .swagger-ui table tbody tr td { vertical-align: middle }
      .swagger-ui .opblock .opblock-summary { border: none }
      .swagger-ui .opblock .opblock-summary-method { border-radius: 4px; min-width: 80px }
    `,
    customSiteTitle: 'WhatsApp API',
    docExpansion: 'list',
    defaultModelsExpandDepth: -1,
    displayRequestDuration: true,
    filter: true
  }) /* #swagger.ignore = true */)
}

module.exports = { routes }
