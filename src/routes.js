const express = require('express')
const routes = express.Router()
const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('../swagger.json')
const { enableCallback, enableSwaggerEndpoint } = require('./config')

const middleware = require('./middleware')
const healthController = require('./controllers/healthController')
const sessionController = require('./controllers/sessionController')
const clientController = require('./controllers/clientController')
const messageController = require('./controllers/messageController')

/**
 * ================
 * HEALTH ENDPOINTS
 * ================
 */

// API endpoint to check if server is alive
routes.get('/ping', /* #swagger.tags = ['Health'] */ healthController.ping)
// API basic callback
if (enableCallback) {
  routes.post('/CallBack', [middleware.apikey, middleware.rateLimiter], /* #swagger.tags = ['Health'] */ healthController.Callback)
}
// Comprehensive health check endpoint
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

sessionRouter.get('/start/:sessionId', middleware.sessionNameValidation, sessionController.startSession)
sessionRouter.get('/status/:sessionId', middleware.sessionNameValidation, sessionController.statusSession)
sessionRouter.get('/qr/:sessionId', middleware.sessionNameValidation, sessionController.sessionQrCode)
sessionRouter.get('/qr/:sessionId/image', middleware.sessionNameValidation, sessionController.sessionQrCodeImage)
sessionRouter.get('/restart/:sessionId', middleware.sessionNameValidation, sessionController.restartSession)
sessionRouter.get('/terminate/:sessionId', middleware.sessionNameValidation, sessionController.terminateSession)
sessionRouter.get('/terminateInactive', sessionController.terminateInactiveSessions)
sessionRouter.get('/terminateAll', sessionController.terminateAllSessions)

/**
 * ================
 * CLIENT ENDPOINTS
 * ================
 */

const clientRouter = express.Router()
clientRouter.use(middleware.apikey)
sessionRouter.use(middleware.clientSwagger)
routes.use('/client', clientRouter)

clientRouter.get('/getClassInfo/:sessionId', [middleware.sessionNameValidation, middleware.sessionValidation], clientController.getClassInfo)
clientRouter.post('/getNumberId/:sessionId', [
  middleware.sessionNameValidation,
  middleware.sessionValidation,
  middleware.validateRequest(['number'])
], clientController.getNumberId)
clientRouter.get('/getState/:sessionId', [middleware.sessionNameValidation], clientController.getState)
clientRouter.post('/sendMessage/:sessionId', [
  middleware.sessionNameValidation,
  middleware.sessionValidation,
  middleware.validateRequest(['chatId', 'content', 'contentType']),
  middleware.sanitizeContentType()
], clientController.sendMessage)
clientRouter.get('/getWWebVersion/:sessionId', [middleware.sessionNameValidation, middleware.sessionValidation], clientController.getWWebVersion)

/**
 * ================
 * MESSAGE ENDPOINTS
 * ================
 */
const messageRouter = express.Router()
messageRouter.use(middleware.apikey)
sessionRouter.use(middleware.messageSwagger)
routes.use('/message', messageRouter)

messageRouter.post('/delete/:sessionId', [
  middleware.sessionNameValidation,
  middleware.sessionValidation,
  middleware.validateRequest(['chatId', 'messageId'])
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
