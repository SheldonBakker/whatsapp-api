const Joi = require('joi');
const { globalApiKey, rateLimitMax, rateLimitWindowMs } = require('./config')
const { sendErrorResponse } = require('./utils')
const { validateSession } = require('./sessions')
const rateLimiting = require('express-rate-limit')
const { logger } = require('./utils/logger') // Import logger
// Import schemas (assuming they are exported correctly)
// const schemas = require('./utils/validationSchemas'); // Adjust path if needed

// --- Generic Joi Validation Middleware ---
const validate = (schema, property = 'body') => {
  return async (req, res, next) => {
    const dataToValidate = req[property];
    const options = {
      abortEarly: false, // Return all errors
      allowUnknown: true, // Allow properties not defined in schema (can be adjusted)
      stripUnknown: false // Do not remove unknown properties (can be adjusted)
    };

    try {
      await schema.validateAsync(dataToValidate, options);
      next(); // Validation successful
    } catch (error) {
      // Log the validation error with details
      const reqLogger = req.logger || logger; // Use request-specific logger if available
      const errorDetails = error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type
      }));
      reqLogger.warn(`Validation Error (${property}): ${error.message}`, {
        validationProperty: property,
        validationErrors: errorDetails,
        requestData: dataToValidate // Be cautious logging sensitive data
      });

      // Determine appropriate status code (400 for general bad input, 422 if syntactically correct but semantically wrong)
      const statusCode = (property === 'body' || property === 'query') ? 400 : 422; // Example logic

      // Send detailed error response (consider simplifying for production)
      return sendErrorResponse(res, statusCode, 'Validation failed', { errors: errorDetails });
    }
  };
};


// JSON payload size validation (Keep as is, Joi doesn't handle raw size)
const validatePayloadSize = (maxSize = 50 * 1024 * 1024) => { // Default 50MB
  return (req, res, next) => {
    const reqLogger = req.logger || logger;
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > maxSize) {
      reqLogger.warn(`Payload too large: ${contentLength} bytes (Max: ${maxSize})`, {
        contentLength,
        maxSize,
        url: req.originalUrl
      });
      return sendErrorResponse(res, 413, 'Payload too large');
    }
    next();
  };
};

// API Key Validation (Keep as is, specific logic)
const apikey = async (req, res, next) => {
  /*
    #swagger.security = [{
          "apiKeyAuth": []
    }]
  */
  /* #swagger.responses[403] = {
        description: "Forbidden.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ForbiddenResponse" }
          }
        }
      }
  */
  try {
    // Use the API key from the config, which is loaded from .env
    const apiKeyFromConfig = globalApiKey

    const reqLogger = req.logger || logger;
    // Ensure API key is set and not empty
    if (!apiKeyFromConfig || apiKeyFromConfig.trim() === '') {
      reqLogger.error('API key is not configured in environment variables');
      return sendErrorResponse(res, 500, 'API authentication is not properly configured');
    }

    // Get the API key from the request headers
    const apiKeyFromRequest = req.headers['x-api-key']

    // Check if the API key is present and matches
    if (!apiKeyFromRequest || apiKeyFromRequest !== apiKeyFromConfig) {
      reqLogger.warn(`Invalid API key attempt`, { providedKeyStart: apiKeyFromRequest?.substring(0, 8) });
      return sendErrorResponse(res, 403, 'Invalid API key');
    }

    // API key is valid, proceed
    next()
  } catch (error) {
    const reqLogger = req.logger || logger;
    reqLogger.error(`API key validation error: ${error.message}`, { error });
    if (!res.headersSent) {
      return sendErrorResponse(res, 500, 'Internal server error during authentication');
    }
  }
};

// Session Exists/Ready Validation (Keep as is, uses custom logic)
const sessionValidation = async (req, res, next) => {
  try {
    const validation = await validateSession(req.params.sessionId)
    if (validation.success !== true) {
      /* #swagger.responses[404] = {
          description: "Not Found.",
          content: {
            "application/json": {
              schema: { "$ref": "#/definitions/NotFoundResponse" }
            }
          }
        }
      */
      return sendErrorResponse(res, 404, validation.message)
    }
    next()
  } catch (error) {
    const reqLogger = req.logger || logger;
    reqLogger.error(`Session validation error: ${error.message}`, { sessionId: req.params?.sessionId, error });
    if (!res.headersSent) {
      return sendErrorResponse(res, 500, 'Error validating session');
    }
  }
}

const rateLimiter = rateLimiting({
  max: rateLimitMax,
  windowMS: rateLimitWindowMs,
  message: "You can't make any more requests at the moment. Try again later"
})

const sessionSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Session']
  */
  next()
}

const clientSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Client']
  */
  next()
}

const contactSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Contact']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the contact',
            example: '6281288888888@c.us'
          }
        }
      }
    }
  */
  next()
}

const messageSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Message']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'The Chat id which contains the message',
            example: '6281288888888@c.us'
          },
          messageId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the message',
            example: 'ABCDEF999999999'
          }
        }
      }
    }
  */
  next()
}

const chatSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Chat']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the given Chat (either group or personnal)',
            example: '6281288888888@c.us'
          }
        }
      }
    }
  */
  next()
}

module.exports = {
  validate, // Export the new generic validator
  validatePayloadSize, // Keep payload size validator
  sessionValidation, // Keep custom session readiness validator
  apikey, // Keep API key validator
  rateLimiter, // Keep rate limiter
  // --- Swagger middlewares (keep as is) ---
  sessionSwagger,
  clientSwagger,
  contactSwagger,
  messageSwagger,
  chatSwagger
  // Removed: validateRequest, sanitizeContentType, sessionNameValidation (replaced by 'validate')
};
