const { globalApiKey, rateLimitMax, rateLimitWindowMs } = require('./config')
const { sendErrorResponse } = require('./utils')
const { validateSession } = require('./sessions')
const rateLimiting = require('express-rate-limit')

// Request validation middleware
const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = []

    for (const field of requiredFields) {
      // Handle nested fields with dot notation (e.g., 'user.name')
      const parts = field.split('.')
      let value = req.body

      for (const part of parts) {
        value = value && value[part]
        if (value === undefined || value === null) {
          missingFields.push(field)
          break
        }
      }
    }

    if (missingFields.length > 0) {
      return sendErrorResponse(res, 400, `Missing required fields: ${missingFields.join(', ')}`)
    }

    next()
  }
}

// JSON payload size validation
const validatePayloadSize = (maxSize = 50 * 1024 * 1024) => { // Default 50MB
  return (req, res, next) => {
    if (req.headers['content-length'] > maxSize) {
      return sendErrorResponse(res, 413, 'Payload too large')
    }
    next()
  }
}

// Sanitize content type
const sanitizeContentType = () => {
  return (req, res, next) => {
    // Sanitize contentType for sendMessage endpoint
    if (req.body && req.body.contentType) {
      const validContentTypes = [
        'string', 'MessageMedia', 'MessageMediaFromURL',
        'Location', 'Buttons', 'List', 'Contact', 'Poll'
      ]

      if (!validContentTypes.includes(req.body.contentType)) {
        return sendErrorResponse(
          res,
          400,
          `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`
        )
      }
    }
    next()
  }
}

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

    // Ensure API key is set and not empty
    if (!apiKeyFromConfig || apiKeyFromConfig.trim() === '') {
      console.error('API key is not configured in environment variables')
      return sendErrorResponse(res, 500, 'API authentication is not properly configured')
    }

    // Get the API key from the request headers
    const apiKeyFromRequest = req.headers['x-api-key']

    // Check if the API key is present and matches
    if (!apiKeyFromRequest || apiKeyFromRequest !== apiKeyFromConfig) {
      console.log(`Invalid API key attempt: ${apiKeyFromRequest?.substring(0, 8)}...`)
      return sendErrorResponse(res, 403, 'Invalid API key')
    }

    // API key is valid, proceed
    next()
  } catch (error) {
    console.error('API key validation error:', error)
    if (!res.headersSent) {
      return sendErrorResponse(res, 500, 'Internal server error during authentication')
    }
  }
}

const sessionNameValidation = async (req, res, next) => {
  /*
    #swagger.parameters['sessionId'] = {
      in: 'path',
      description: 'Unique identifier for the session (alphanumeric and - allowed)',
      required: true,
      type: 'string',
      example: 'f8377d8d-a589-4242-9ba6-9486a04ef80c'
    }
  */
  if ((!/^[\w-]+$/.test(req.params.sessionId))) {
    /* #swagger.responses[422] = {
        description: "Unprocessable Entity.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ErrorResponse" }
          }
        }
      }
    */
    return sendErrorResponse(res, 422, 'Session should be alphanumerical or -')
  }
  next()
}

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
    console.error('Session validation error:', error)
    if (!res.headersSent) {
      return sendErrorResponse(res, 500, 'Error validating session')
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
  sessionValidation,
  apikey,
  sessionNameValidation,
  sessionSwagger,
  clientSwagger,
  contactSwagger,
  messageSwagger,
  chatSwagger,
  rateLimiter,
  validateRequest,
  validatePayloadSize,
  sanitizeContentType
}
