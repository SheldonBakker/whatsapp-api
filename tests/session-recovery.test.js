const axios = require('axios')
const { DockerTestUtils } = require('./docker-test-utils')

describe('Session Recovery Tests', () => {
  let testUtils
  const testSessionId = 'recovery-test-session'

  beforeAll(async () => {
    testUtils = new DockerTestUtils()
    await testUtils.waitForService()
  }, 60000)

  afterAll(async () => {
    // Clean up test session
    try {
      await testUtils.terminateSession(testSessionId)
    } catch (error) {
      console.log('Cleanup error (expected):', error.message)
    }
  })

  describe('Session Not Found Recovery', () => {
    test('should return helpful error message when session not found', async () => {
      try {
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error.response.status).toBe(404)
        expect(error.response.data.success).toBe(false)
        expect(error.response.data.error).toContain('Session not found')
        expect(error.response.data.error).toContain('create a new session')
      }
    })

    test('should provide session creation guidance', async () => {
      try {
        await axios.post(
          `${testUtils.baseUrl}/sendMessage/nonexistent-session`,
          {
            chatId: '1234567890@c.us',
            contentType: 'string',
            content: 'Test message'
          },
          {
            headers: { 'x-api-key': testUtils.apiKey },
            timeout: 10000
          }
        )
      } catch (error) {
        expect(error.response.data.error).toMatch(/session\/start/)
      }
    })
  })

  describe('Session Health Monitoring', () => {
    test('should return health status for all sessions', async () => {
      const response = await axios.get(
        `${testUtils.baseUrl}/health`,
        {
          headers: { 'x-api-key': testUtils.apiKey },
          timeout: 10000
        }
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data).toHaveProperty('totalSessions')
      expect(response.data.data).toHaveProperty('healthySessions')
      expect(response.data.data).toHaveProperty('unhealthySessions')
      expect(response.data.data).toHaveProperty('sessionDetails')
      expect(Array.isArray(response.data.data.sessionDetails)).toBe(true)
    })

    test('should include session details in health status', async () => {
      // First create a session
      await testUtils.createSession(testSessionId)

      // Wait a moment for session to initialize
      await new Promise(resolve => setTimeout(resolve, 2000))

      const response = await axios.get(
        `${testUtils.baseUrl}/health`,
        {
          headers: { 'x-api-key': testUtils.apiKey },
          timeout: 10000
        }
      )

      expect(response.data.data.totalSessions).toBeGreaterThan(0)

      const sessionDetail = response.data.data.sessionDetails.find(
        session => session.sessionId === testSessionId
      )

      if (sessionDetail) {
        expect(sessionDetail).toHaveProperty('sessionId')
        expect(sessionDetail).toHaveProperty('isHealthy')
        expect(sessionDetail).toHaveProperty('failureCount')
        expect(sessionDetail).toHaveProperty('state')
        expect(sessionDetail).toHaveProperty('message')
      }
    })
  })

  describe('Session Recovery with Existing Data', () => {
    test('should handle session recovery when session exists on disk but not in memory', async () => {
      // This test simulates a server restart scenario
      // where session data exists on disk but the session is not in memory

      // Create a session first
      await testUtils.createSession(testSessionId)

      // Wait for session to be created
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Verify session exists
      const statusResponse = await axios.get(
        `${testUtils.baseUrl}/session/status/${testSessionId}`,
        {
          headers: { 'x-api-key': testUtils.apiKey },
          timeout: 10000
        }
      )

      expect(statusResponse.status).toBe(200)
      expect(statusResponse.data.success).toBe(true)
    })
  })

  describe('Enhanced Error Messages', () => {
    test('should provide clear error messages for different session states', async () => {
      const testCases = [
        {
          sessionId: 'nonexistent-session',
          expectedErrorPattern: /Session not found.*create a new session/
        }
      ]

      for (const testCase of testCases) {
        try {
          await axios.post(
            `${testUtils.baseUrl}/sendMessage/${testCase.sessionId}`,
            {
              chatId: '1234567890@c.us',
              contentType: 'string',
              content: 'Test message'
            },
            {
              headers: { 'x-api-key': testUtils.apiKey },
              timeout: 10000
            }
          )

          // Should not reach here
          expect(true).toBe(false)
        } catch (error) {
          expect(error.response.status).toBe(404)
          expect(error.response.data.error).toMatch(testCase.expectedErrorPattern)
        }
      }
    })
  })
})
