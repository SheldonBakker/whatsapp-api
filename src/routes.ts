import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';
import { enableSwaggerEndpoint } from './config';

import * as middleware from './middleware';
import { validate } from './middleware'; // Import the new validate function
import * as schemas from './utils/validationSchemas'; // Import validation schemas
import * as healthController from './controllers/healthController';
import * as sessionController from './controllers/sessionController';
import * as clientController from './controllers/clientController';

const routes = express.Router();

/**
 * ================
 * HEALTH ENDPOINT
 * ================
 */

// Comprehensive health check endpoint - requires API key
routes.get('/health', [middleware.apikey], /* #swagger.tags = ['Health'] */ healthController.healthCheck);

/**
 * ================
 * SESSION ENDPOINTS
 * ================
 */

// Session management endpoints - moved to root level
routes.get('/start/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  middleware.sessionSwagger
], sessionController.startSession);

routes.get('/qr/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  middleware.sessionSwagger
], sessionController.sessionQrCode);

routes.get('/qr/:sessionId/image', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  middleware.sessionSwagger
], sessionController.sessionQrCodeImage);

routes.get('/restart/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  middleware.sessionSwagger
], sessionController.restartSession);

routes.get('/terminate/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  middleware.sessionSwagger
], sessionController.terminateSession);

// Session listing endpoint - no sessionId param needed
routes.get('/all', [middleware.apikey, middleware.sessionSwagger], sessionController.getAllSessions);

/**
 * ================
 * MESSAGE ENDPOINT
 * ================
 */

// Send message endpoint - moved to root level
routes.post('/sendMessage/:sessionId', [
  middleware.apikey,
  validate(schemas.sessionIdParamSchema, 'params'),
  validate(schemas.sendMessageBodySchema, 'body'), // Validate request body first
  middleware.sessionValidation // Then validate session exists
], clientController.sendMessage);



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
