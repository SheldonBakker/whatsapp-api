const request = require('supertest')
const app = require('../dist/src/app').default
const swaggerDocument = require('../swagger.json')

// Test configuration
const API_KEY = process.env.API_KEY || 'test-api-key'

describe('Swagger Documentation Validation', () => {
  // Helper function to make authenticated requests
  const makeRequest = (method, path, data = null) => {
    const req = request(app)[method](path).set('x-api-key', API_KEY)
    if (data) {
      req.send(data)
    }
    return req
  }

  describe('Swagger Document Structure', () => {
    test('should have valid OpenAPI 3.0.0 structure', () => {
      expect(swaggerDocument.openapi).toBe('3.0.0')
      expect(swaggerDocument.info).toBeDefined()
      expect(swaggerDocument.info.title).toBe('WhatsApp API')
      expect(swaggerDocument.paths).toBeDefined()
      expect(swaggerDocument.components).toBeDefined()
    })

    test('should have all required tags defined', () => {
      const expectedTags = ['Health', 'Session', 'Client', 'Message', 'Chat', 'Contact']
      const actualTags = swaggerDocument.tags.map(tag => tag.name)

      expectedTags.forEach(tag => {
        expect(actualTags).toContain(tag)
      })
    })

    test('should have security schemes defined', () => {
      expect(swaggerDocument.components.securitySchemes).toBeDefined()
      expect(swaggerDocument.components.securitySchemes.apiKeyAuth).toBeDefined()
      expect(swaggerDocument.components.securitySchemes.apiKeyAuth.type).toBe('apiKey')
      expect(swaggerDocument.components.securitySchemes.apiKeyAuth.name).toBe('x-api-key')
    })
  })

  describe('Path Validation', () => {
    test('should have correct session endpoints with proper prefixes', () => {
      const sessionPaths = [
        '/session/start/{sessionId}',
        '/session/status/{sessionId}',
        '/session/qr/{sessionId}',
        '/session/qr/{sessionId}/image',
        '/session/restart/{sessionId}',
        '/session/terminate/{sessionId}',
        '/session/terminateInactive',
        '/session/terminateAll',
        '/session/all'
      ]

      sessionPaths.forEach(path => {
        expect(swaggerDocument.paths[path]).toBeDefined()
        console.log(`✓ Session path found: ${path}`)
      })
    })

    test('should have correct client endpoints with proper prefixes', () => {
      const clientPaths = [
        '/client/getClassInfo/{sessionId}',
        '/client/getNumberId/{sessionId}',
        '/client/getState/{sessionId}',
        '/client/sendMessage/{sessionId}',
        '/client/getWWebVersion/{sessionId}'
      ]

      clientPaths.forEach(path => {
        expect(swaggerDocument.paths[path]).toBeDefined()
        console.log(`✓ Client path found: ${path}`)
      })
    })

    test('should have correct message, chat, and contact endpoints', () => {
      const otherPaths = [
        '/message/delete/{sessionId}',
        '/chat/getClassInfo/{sessionId}',
        '/chat/delete/{sessionId}',
        '/chat/clearMessages/{sessionId}',
        '/chat/clearState/{sessionId}',
        '/chat/fetchMessages/{sessionId}',
        '/chat/getContact/{sessionId}',
        '/chat/sendStateRecording/{sessionId}',
        '/chat/sendStateTyping/{sessionId}',
        '/contact/getClassInfo/{sessionId}',
        '/contact/block/{sessionId}',
        '/contact/getAbout/{sessionId}',
        '/contact/getChat/{sessionId}',
        '/contact/unblock/{sessionId}',
        '/contact/getFormattedNumber/{sessionId}',
        '/contact/getCountryCode/{sessionId}',
        '/contact/getProfilePicUrl/{sessionId}'
      ]

      otherPaths.forEach(path => {
        expect(swaggerDocument.paths[path]).toBeDefined()
        console.log(`✓ Path found: ${path}`)
      })
    })
  })

  describe('Parameter Validation', () => {
    test('should have sessionId parameters properly defined', () => {
      const pathsWithSessionId = Object.keys(swaggerDocument.paths).filter(path =>
        path.includes('{sessionId}')
      )

      pathsWithSessionId.forEach(path => {
        const pathObj = swaggerDocument.paths[path]
        const methods = Object.keys(pathObj)

        methods.forEach(method => {
          const operation = pathObj[method]
          if (operation.parameters) {
            const sessionIdParam = operation.parameters.find(p => p.name === 'sessionId')
            if (sessionIdParam) {
              expect(sessionIdParam.in).toBe('path')
              expect(sessionIdParam.required).toBe(true)
              expect(sessionIdParam.schema.type).toBe('string')
              expect(sessionIdParam.schema.pattern).toBeDefined()
            }
          }
        })
      })
    })

    test('should have proper request body schemas for POST endpoints', () => {
      const postEndpoints = [
        '/client/getNumberId/{sessionId}',
        '/client/sendMessage/{sessionId}',
        '/message/delete/{sessionId}'
      ]

      postEndpoints.forEach(path => {
        const postOperation = swaggerDocument.paths[path].post
        expect(postOperation.requestBody).toBeDefined()
        expect(postOperation.requestBody.required).toBe(true)
        expect(postOperation.requestBody.content['application/json']).toBeDefined()
        console.log(`✓ Request body defined for: ${path}`)
      })
    })
  })

  describe('Response Schema Validation', () => {
    test('should have proper response schemas defined', () => {
      const requiredSchemas = [
        'StartSessionResponse',
        'StatusSessionResponse',
        'RestartSessionResponse',
        'TerminateSessionResponse',
        'TerminateSessionsResponse',
        'SendMessageRequest',
        'ChatIdRequest',
        'ContactIdRequest',
        'ErrorResponse',
        'NotFoundResponse',
        'ForbiddenResponse',
        'BadRequestResponse',
        'UnprocessableEntityResponse'
      ]

      requiredSchemas.forEach(schema => {
        expect(swaggerDocument.components.schemas[schema]).toBeDefined()
        console.log(`✓ Schema defined: ${schema}`)
      })
    })

    test('should have proper response references', () => {
      const requiredResponses = [
        'ErrorResponse',
        'NotFoundResponse',
        'ForbiddenResponse',
        'BadRequestResponse',
        'UnprocessableEntityResponse'
      ]

      requiredResponses.forEach(response => {
        expect(swaggerDocument.components.responses[response]).toBeDefined()
        console.log(`✓ Response defined: ${response}`)
      })
    })
  })

  describe('Endpoint Accessibility Tests', () => {
    test('should access health endpoints as documented', async () => {
      // Test ping endpoint (no auth required)
      const pingResponse = await request(app).get('/ping')
      expect(pingResponse.status).toBe(200)
      expect(pingResponse.body).toHaveProperty('success', true)

      // Test health endpoint (auth required)
      const healthResponse = await makeRequest('get', '/health')
      expect(healthResponse.status).toBe(200)
      expect(healthResponse.body).toHaveProperty('success', true)

      console.log('✓ Health endpoints accessible')
    })

    test('should access session endpoints as documented', async () => {
      const testSessionId = 'swagger-test-session'

      try {
        // Test session start
        const startResponse = await makeRequest('get', `/session/start/${testSessionId}`)
        expect([200, 202]).toContain(startResponse.status)
        expect(startResponse.body).toHaveProperty('success', true)

        // Test session status
        const statusResponse = await makeRequest('get', `/session/status/${testSessionId}`)
        expect(statusResponse.status).toBe(200)
        expect(statusResponse.body).toHaveProperty('success', true)

        // Test session list
        const allResponse = await makeRequest('get', '/session/all')
        expect(allResponse.status).toBe(200)
        expect(allResponse.body).toHaveProperty('success', true)

        console.log('✓ Session endpoints accessible')
      } finally {
        // Cleanup
        try {
          await makeRequest('get', `/session/terminate/${testSessionId}`)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })

    test('should validate request body formats as documented', async () => {
      const testSessionId = 'swagger-validation-session'

      try {
        // Start a session first
        await makeRequest('get', `/session/start/${testSessionId}`)
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Test getNumberId with valid body
        const validNumberBody = { number: '1234567890' }
        const numberResponse = await makeRequest('post', `/client/getNumberId/${testSessionId}`, validNumberBody)
        // Should succeed or fail gracefully (not 400 for valid format)
        expect(numberResponse.status).not.toBe(400)

        // Test sendMessage with valid body
        const validMessageBody = {
          chatId: '1234567890@c.us',
          contentType: 'text',
          content: 'Test message'
        }
        const messageResponse = await makeRequest('post', `/client/sendMessage/${testSessionId}`, validMessageBody)
        // Should succeed or fail gracefully (not 400 for valid format)
        expect(messageResponse.status).not.toBe(400)

        console.log('✓ Request body validation working')
      } finally {
        // Cleanup
        try {
          await makeRequest('get', `/session/terminate/${testSessionId}`)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })

    test('should reject invalid request formats as documented', async () => {
      const testSessionId = 'swagger-validation-session-2'

      try {
        // Start a session first
        await makeRequest('get', `/session/start/${testSessionId}`)
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Test invalid sessionId format (URL-encoded spaces result in 404 from Express routing)
        const invalidSessionResponse = await makeRequest('get', '/session/status/invalid session id')
        expect(invalidSessionResponse.status).toBe(404) // Express routing returns 404 for URL-encoded invalid paths

        // Test invalid request body
        const invalidBody = { invalidField: 'value' }
        const invalidBodyResponse = await makeRequest('post', `/client/getNumberId/${testSessionId}`, invalidBody)
        expect([400, 404]).toContain(invalidBodyResponse.status) // 400 for validation errors, 404 for session not ready

        console.log('✓ Invalid request rejection working')
      } finally {
        // Cleanup
        try {
          await makeRequest('get', `/session/terminate/${testSessionId}`)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })
  })

  describe('Security Documentation Validation', () => {
    test('should require API key for protected endpoints', async () => {
      const protectedEndpoints = [
        { method: 'get', path: '/health' },
        { method: 'get', path: '/session/all' },
        { method: 'get', path: '/session/start/test-session' }
      ]

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
        expect(response.status).toBe(403)
        expect(response.body).toHaveProperty('success', false)
        console.log(`✓ API key required for: ${endpoint.method.toUpperCase()} ${endpoint.path}`)
      }
    })

    test('should allow access with valid API key', async () => {
      const response = await makeRequest('get', '/health')
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      console.log('✓ Valid API key allows access')
    })
  })
})
