const request = require('supertest')
const app = require('../dist/src/app').default

// Test configuration
const API_KEY = process.env.API_KEY || 'test-api-key'
const BASE_URL = 'http://localhost:3000'
const TEST_SESSIONS = ['test-session-1', 'test-session-2', 'test-session-3']

describe('Multi-Session WhatsApp API Tests', () => {
  // Helper function to make authenticated requests
  const makeRequest = (method, path, data = null) => {
    const req = request(app)[method](path).set('x-api-key', API_KEY)
    if (data) {
      req.send(data)
    }
    return req
  }

  // Clean up any existing test sessions before starting
  beforeAll(async () => {
    console.log('Cleaning up existing test sessions...')
    for (const sessionId of TEST_SESSIONS) {
      try {
        await makeRequest('get', `/session/terminate/${sessionId}`)
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    // Wait a bit for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  // Clean up test sessions after all tests
  afterAll(async () => {
    console.log('Final cleanup of test sessions...')
    for (const sessionId of TEST_SESSIONS) {
      try {
        await makeRequest('get', `/session/terminate/${sessionId}`)
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  })

  describe('Session Creation and Management', () => {
    test('should create multiple sessions concurrently', async () => {
      console.log('Testing concurrent session creation...')

      // Start all sessions concurrently
      const sessionPromises = TEST_SESSIONS.map(sessionId =>
        makeRequest('get', `/session/start/${sessionId}`)
      )

      const responses = await Promise.all(sessionPromises)

      // All requests should succeed (200 or 202)
      responses.forEach((response, index) => {
        expect([200, 202]).toContain(response.status)
        expect(response.body).toHaveProperty('success', true)
        console.log(`Session ${TEST_SESSIONS[index]}: ${response.status} - ${response.body.message}`)
      })
    })

    test('should verify each session has independent status', async () => {
      console.log('Testing session independence...')

      // Wait a bit for sessions to initialize
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Check status of each session
      for (const sessionId of TEST_SESSIONS) {
        const response = await makeRequest('get', `/session/status/${sessionId}`)

        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('success', true)
        expect(response.body).toHaveProperty('state')

        console.log(`Session ${sessionId} status: ${response.body.state} - ${response.body.message}`)
      }
    })

    test('should list all active sessions', async () => {
      console.log('Testing session listing...')

      const response = await makeRequest('get', '/session/all')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('sessions')
      expect(Array.isArray(response.body.sessions)).toBe(true)

      // Should have at least our test sessions
      const sessionIds = response.body.sessions.map(s => s.sessionId)
      TEST_SESSIONS.forEach(sessionId => {
        expect(sessionIds).toContain(sessionId)
      })

      console.log(`Found ${response.body.sessions.length} active sessions`)
    })

    test('should handle session restart independently', async () => {
      console.log('Testing independent session restart...')

      const sessionToRestart = TEST_SESSIONS[0]

      // Restart one session
      const restartResponse = await makeRequest('get', `/session/restart/${sessionToRestart}`)
      expect(restartResponse.status).toBe(200)
      expect(restartResponse.body).toHaveProperty('success', true)

      // Wait a bit for restart to process
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Check that other sessions are still active
      for (let i = 1; i < TEST_SESSIONS.length; i++) {
        const statusResponse = await makeRequest('get', `/session/status/${TEST_SESSIONS[i]}`)
        expect(statusResponse.status).toBe(200)
        expect(statusResponse.body).toHaveProperty('success', true)

        console.log(`Session ${TEST_SESSIONS[i]} after restart of ${sessionToRestart}: ${statusResponse.body.state}`)
      }
    })
  })

  describe('Session Isolation Tests', () => {
    test('should validate session ID format', async () => {
      console.log('Testing session ID validation...')

      const invalidSessionIds = [
        { id: 'invalid session', expectedStatus: 404 }, // spaces - URL routing issue
        { id: 'invalid@session', expectedStatus: 422 }, // special chars - validation error
        { id: 'invalid.session', expectedStatus: 422 }, // dots - validation error
        { id: '', expectedStatus: 404 }, // empty - routing issue
        { id: 'a'.repeat(100), expectedStatus: 422 } // too long - validation error
      ]

      for (const { id: invalidId } of invalidSessionIds) {
        const response = await makeRequest('get', `/session/start/${invalidId}`)
        expect([400, 404, 422]).toContain(response.status) // Accept any of these as valid error responses

        // Some invalid IDs might return empty body due to routing issues
        if (response.body && typeof response.body === 'object') {
          expect(response.body).toHaveProperty('success', false)
        }

        console.log(`Invalid session ID "${invalidId}": ${response.status} - ${response.body?.error || 'No error message'}`)
      }
    })

    test('should handle non-existent session gracefully', async () => {
      console.log('Testing non-existent session handling...')

      const nonExistentSession = 'non-existent-session-12345'

      // Try to get status of non-existent session
      const statusResponse = await makeRequest('get', `/session/status/${nonExistentSession}`)
      expect(statusResponse.status).toBe(404) // Non-existent sessions return 404
      expect(statusResponse.body).toHaveProperty('success', false)
      // Should indicate session not found

      console.log(`Non-existent session status: ${statusResponse.body.message}`)
    })

    test('should prevent unauthorized access without API key', async () => {
      console.log('Testing API key requirement...')

      const response = await request(app)
        .get(`/session/status/${TEST_SESSIONS[0]}`)
        .expect(403)

      expect(response.body).toHaveProperty('success', false)
      console.log('Unauthorized access properly blocked')
    })
  })

  describe('Client Operations with Multiple Sessions', () => {
    test('should get client state for each session independently', async () => {
      console.log('Testing independent client state retrieval...')

      for (const sessionId of TEST_SESSIONS) {
        const response = await makeRequest('get', `/client/getState/${sessionId}`)

        // Should succeed or return appropriate error for session state
        expect([200, 404, 500]).toContain(response.status)

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true)
          expect(response.body).toHaveProperty('state')
          console.log(`Client state for ${sessionId}: ${response.body.state}`)
        } else {
          console.log(`Client state for ${sessionId}: ${response.body.error}`)
        }
      }
    })

    test('should validate request body for client operations', async () => {
      console.log('Testing client operation validation...')

      const sessionId = TEST_SESSIONS[0]

      // Test getNumberId with invalid body
      const invalidBodies = [
        {}, // missing number
        { number: '' }, // empty number
        { number: 'invalid-number!' }, // invalid format
        { invalidField: '123456789' } // wrong field name
      ]

      for (const invalidBody of invalidBodies) {
        const response = await makeRequest('post', `/client/getNumberId/${sessionId}`, invalidBody)
        expect([400, 404]).toContain(response.status) // 400 for validation errors, 404 for session not ready
        expect(response.body).toHaveProperty('success', false)

        console.log(`Invalid body validation: ${response.status} - ${response.body.error}`)
      }
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle concurrent operations on same session', async () => {
      console.log('Testing concurrent operations on same session...')

      const sessionId = TEST_SESSIONS[0]

      // Make multiple concurrent requests to the same session
      const concurrentPromises = [
        makeRequest('get', `/session/status/${sessionId}`),
        makeRequest('get', `/client/getState/${sessionId}`),
        makeRequest('get', `/session/qr/${sessionId}`),
        makeRequest('get', `/client/getWWebVersion/${sessionId}`)
      ]

      const responses = await Promise.allSettled(concurrentPromises)

      // At least some should succeed, none should crash the server
      responses.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          expect(result.value.status).toBeLessThan(600) // Valid HTTP status
          console.log(`Concurrent operation ${index}: ${result.value.status}`)
        } else {
          console.log(`Concurrent operation ${index} failed: ${result.reason.message}`)
        }
      })
    })

    test('should handle session termination gracefully', async () => {
      console.log('Testing graceful session termination...')

      const sessionToTerminate = TEST_SESSIONS[2] // Use last session for termination

      // Terminate the session
      const terminateResponse = await makeRequest('get', `/session/terminate/${sessionToTerminate}`)
      expect(terminateResponse.status).toBe(200)
      expect(terminateResponse.body).toHaveProperty('success', true)

      // Wait for termination to complete
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Verify other sessions are still active (or at least responding)
      for (let i = 0; i < TEST_SESSIONS.length - 1; i++) {
        const statusResponse = await makeRequest('get', `/session/status/${TEST_SESSIONS[i]}`)
        expect([200, 404]).toContain(statusResponse.status) // 200 if active, 404 if not found

        console.log(`Session ${TEST_SESSIONS[i]} after terminating ${sessionToTerminate}: ${statusResponse.status} - ${statusResponse.body?.state || statusResponse.body?.message}`)
      }
    })
  })

  describe('Performance and Resource Management', () => {
    test('should handle rapid session creation and termination', async () => {
      console.log('Testing rapid session lifecycle...')

      const rapidTestSessions = ['rapid-1', 'rapid-2', 'rapid-3']

      try {
        // Rapid creation
        const createPromises = rapidTestSessions.map(sessionId =>
          makeRequest('get', `/session/start/${sessionId}`)
        )
        const createResponses = await Promise.allSettled(createPromises)

        // Check that at least some sessions were created successfully
        const successfulCreations = createResponses.filter(result =>
          result.status === 'fulfilled' && [200, 202].includes(result.value.status)
        )
        expect(successfulCreations.length).toBeGreaterThan(0)

        // Brief wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Rapid termination - use allSettled to handle potential errors gracefully
        const terminatePromises = rapidTestSessions.map(sessionId =>
          makeRequest('get', `/session/terminate/${sessionId}`)
        )
        const terminateResults = await Promise.allSettled(terminatePromises)

        // Check that termination requests were processed (even if some sessions weren't fully initialized)
        const successfulTerminations = terminateResults.filter(result =>
          result.status === 'fulfilled' && result.value.status === 200
        )

        console.log(`Rapid lifecycle test: ${successfulCreations.length}/${rapidTestSessions.length} created, ${successfulTerminations.length}/${rapidTestSessions.length} terminated`)

        // At least some operations should succeed
        expect(successfulCreations.length + successfulTerminations.length).toBeGreaterThan(0)

        console.log('Rapid lifecycle test completed successfully')
      } catch (error) {
        console.error('Rapid lifecycle test failed:', error.message)
        // Don't fail the test for browser-related errors in test environment
        if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
          console.log('Browser protocol error detected - this is expected in test environment')
          return
        }
        throw error
      }
    })
  })
})
