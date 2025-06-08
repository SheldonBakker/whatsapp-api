import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';
import { enableCallback, enableSwaggerEndpoint } from './config';

import * as middleware from './middleware';
import { validate } from './middleware'; // Import the new validate function
import * as schemas from './utils/validationSchemas'; // Import validation schemas
import * as healthController from './controllers/healthController';
import * as sessionController from './controllers/sessionController';
import * as clientController from './controllers/clientController';
import * as messageController from './controllers/messageController';
import * as chatController from './controllers/chatController';
import * as contactController from './controllers/contactController';

const routes = express.Router();

/**
 * ================
 * HEALTH ENDPOINTS
 * ================
 */

// API endpoint to check if server is alive - no API key required
routes.get('/ping', /* #swagger.tags = ['Health'] */ healthController.ping);

// API basic callback
if (enableCallback) {
  routes.post('/callback', [middleware.apikey, middleware.rateLimiter], /* #swagger.tags = ['Health'] */ healthController.Callback);
}

// Comprehensive health check endpoint - requires API key
routes.get('/health', [middleware.apikey], /* #swagger.tags = ['Health'] */ healthController.healthCheck);

// Manually trigger WhatsApp health check messages - requires API key
routes.post('/health/check', [middleware.apikey], /* #swagger.tags = ['Health'] */ healthController.triggerHealthCheck);

// Test health check with a specific session - requires API key
routes.post('/health/check/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params')
], /* #swagger.tags = ['Health'] */ healthController.testHealthCheckWithSession);

/**
 * ================
 * SESSION ENDPOINTS
 * ================
 */
const sessionRouter = express.Router();
sessionRouter.use(middleware.apikey);
sessionRouter.use(middleware.sessionSwagger);
routes.use('/session', sessionRouter);

// Apply sessionId validation to all routes with :sessionId param
sessionRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

sessionRouter.get('/start/:sessionId', sessionController.startSession); // Validation applied by .use() above
sessionRouter.get('/status/:sessionId', sessionController.statusSession); // Validation applied by .use() above
sessionRouter.get('/status-enhanced/:sessionId', sessionController.sessionStatusWithRecovery); // Enhanced status with recovery
sessionRouter.get('/qr/:sessionId', sessionController.sessionQrCode); // Validation applied by .use() above
sessionRouter.get('/qr/:sessionId/image', sessionController.sessionQrCodeImage); // Validation applied by .use() above
sessionRouter.get('/restart/:sessionId', sessionController.restartSession); // Validation applied by .use() above
sessionRouter.get('/terminate/:sessionId', sessionController.terminateSession); // Validation applied by .use() above
sessionRouter.get('/terminateInactive', sessionController.terminateInactiveSessions); // No sessionId param
sessionRouter.get('/terminateAll', sessionController.terminateAllSessions); // No sessionId param
sessionRouter.get('/all', sessionController.getAllSessions); // No sessionId param

/**
 * ================
 * CLIENT ENDPOINTS
 * ================
 */

const clientRouter = express.Router();
clientRouter.use(middleware.apikey);
sessionRouter.use(middleware.clientSwagger);
routes.use('/client', clientRouter);

// Apply sessionId validation to all client routes with :sessionId param
clientRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

clientRouter.get('/getClassInfo/:sessionId', [middleware.sessionValidation], clientController.getClassInfo); // Param validation applied by .use()
clientRouter.post('/getNumberId/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.getNumberIdBodySchema, 'body') // Validate request body
], clientController.getNumberId);
clientRouter.get('/getState/:sessionId', clientController.getState); // Param validation applied by .use()
clientRouter.post('/sendMessage/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.sendMessageBodySchema, 'body') // Validate request body
], clientController.sendMessage);
clientRouter.get('/getWWebVersion/:sessionId', [middleware.sessionValidation], clientController.getWWebVersion); // Param validation applied by .use()

/**
 * ================
 * MESSAGE ENDPOINTS
 * ================
 */
const messageRouter = express.Router();
messageRouter.use(middleware.apikey);
messageRouter.use(middleware.messageSwagger); // Apply swagger tag middleware
routes.use('/message', messageRouter);

// Apply sessionId validation to all message routes with :sessionId param
messageRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

messageRouter.post('/delete/:sessionId', [
  middleware.sessionValidation,
  validate(schemas.deleteMessageBodySchema, 'body') // Validate request body
], messageController.deleteMessage);

/**
 * ================
 * CHAT ENDPOINTS
 * ================
 */
const chatRouter = express.Router();
chatRouter.use(middleware.apikey);
routes.use('/chat', chatRouter);

// Apply sessionId validation to all chat routes with :sessionId param
chatRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

chatRouter.post('/getClassInfo/:sessionId', [middleware.sessionValidation], chatController.getClassInfo);
chatRouter.post('/clearMessages/:sessionId', [middleware.sessionValidation], chatController.clearMessages);
chatRouter.post('/clearState/:sessionId', [middleware.sessionValidation], chatController.clearState);
chatRouter.post('/delete/:sessionId', [middleware.sessionValidation], chatController.deleteChat);
chatRouter.post('/fetchMessages/:sessionId', [middleware.sessionValidation], chatController.fetchMessages);
chatRouter.post('/getContact/:sessionId', [middleware.sessionValidation], chatController.getContact);
chatRouter.post('/sendStateRecording/:sessionId', [middleware.sessionValidation], chatController.sendStateRecording);
chatRouter.post('/sendStateTyping/:sessionId', [middleware.sessionValidation], chatController.sendStateTyping);

/**
 * ================
 * CONTACT ENDPOINTS
 * ================
 */
const contactRouter = express.Router();
contactRouter.use(middleware.apikey);
routes.use('/contact', contactRouter);

// Apply sessionId validation to all contact routes with :sessionId param
contactRouter.use('/:sessionId', validate(schemas.sessionIdParamSchema, 'params'));

contactRouter.post('/getClassInfo/:sessionId', [middleware.sessionValidation], contactController.getClassInfo);
contactRouter.post('/block/:sessionId', [middleware.sessionValidation], contactController.block);
contactRouter.post('/getAbout/:sessionId', [middleware.sessionValidation], contactController.getAbout);
contactRouter.post('/getChat/:sessionId', [middleware.sessionValidation], contactController.getChat);
contactRouter.post('/unblock/:sessionId', [middleware.sessionValidation], contactController.unblock);
contactRouter.post('/getFormattedNumber/:sessionId', [middleware.sessionValidation], contactController.getFormattedNumber);
contactRouter.post('/getCountryCode/:sessionId', [middleware.sessionValidation], contactController.getCountryCode);
contactRouter.post('/getProfilePicUrl/:sessionId', [middleware.sessionValidation], contactController.getProfilePicUrl);

/**
 * ================
 * SWAGGER ENDPOINTS
 * ================
 */
if (enableSwaggerEndpoint) {
  routes.use('/api-docs', swaggerUi.serve);
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
    customSiteTitle: 'WhatsApp API'
  } as any) /* #swagger.ignore = true */);
}

export { routes };
