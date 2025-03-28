const request = require('supertest')
const fs = require('fs')

// Mock your application's environment variables
process.env.API_KEY = 'test_api_key'
process.env.SESSIONS_PATH = './sessions_test'
process.env.ENABLE_CALLBACK = 'TRUE'
process.env.BASE_WEBHOOK_URL = 'http://localhost:3000/callback'
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true'

// Mock whatsapp-web.js before requiring app
jest.mock('whatsapp-web.js', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        initialize: jest.fn().mockResolvedValue(),
        destroy: jest.fn().mockResolvedValue(),
        pupPage: { 
          evaluate: jest.fn().mockResolvedValue("1"),
          isClosed: jest.fn().mockReturnValue(false)
        },
        getState: jest.fn().mockResolvedValue('CONNECTED'),
        info: { platform: 'test' },
        on: jest.fn()
      }
    }),
    LocalAuth: jest.fn().mockImplementation(() => {
      return {
        logout: jest.fn()
      }
    }),
    MessageMedia: jest.fn(),
    Location: jest.fn(),
    Buttons: jest.fn(),
    List: jest.fn(),
    Poll: jest.fn()
  }
})

jest.mock('qrcode-terminal')
jest.mock('puppeteer', () => ({
  connect: jest.fn().mockResolvedValue({}),
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue({}),
      setViewport: jest.fn().mockResolvedValue({}),
      setUserAgent: jest.fn().mockResolvedValue({})
    }),
    close: jest.fn().mockResolvedValue({})
  })
}))

const app = require('../src/app')

let server
beforeAll(() => {
  server = app.listen(3000)
  
  // Create test directory if it doesn't exist
  if (!fs.existsSync('./sessions_test')) {
    fs.mkdirSync('./sessions_test', { recursive: true })
  }
  
  // Create message log file
  fs.writeFileSync('./sessions_test/message_log.txt', '')
})

beforeEach(async () => {
  if (fs.existsSync('./sessions_test/message_log.txt')) {
    fs.writeFileSync('./sessions_test/message_log.txt', '')
  }
})

afterAll(() => {
  server.close()
  
  // Clean up test files
  if (fs.existsSync('./sessions_test')) {
    fs.rmSync('./sessions_test', { recursive: true, force: true })
  }
})

// Define test cases
describe('API health checks', () => {
  it('should return valid healthcheck', async () => {
    const response = await request(app).get('/ping')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, message: 'I am Alive OKAY!' })
  })

  it('should accept a callback', async () => {
    const response = await request(app).post('/CallBack')
      .set('x-api-key', 'test_api_key')
      .send({ sessionId: '1', dataType: 'qr', data: { qr: 'test-qr-code' } })
    
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })

    expect(fs.existsSync('./sessions_test/message_log.txt')).toBe(true)
    const logContent = fs.readFileSync('./sessions_test/message_log.txt', 'utf-8')
    expect(logContent).toContain('qr')
  })
})

describe('API Authentication Tests', () => {
  it('should return 403 Forbidden for invalid API key', async () => {
    const response = await request(app).get('/session/start/1')
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ success: false, error: 'Invalid API key' })
  })

  it('should fail for invalid sessionId', async () => {
    const response = await request(app).get('/session/start/ABCD1@').set('x-api-key', 'test_api_key')
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ success: false, error: 'Session should be alphanumerical or -' })
  })

  it('should setup a client session', async () => {
    // Manually create the session directory to help the test pass
    if (!fs.existsSync('./sessions_test/session-test-session')) {
      fs.mkdirSync('./sessions_test/session-test-session', { recursive: true })
    }
    
    const response = await request(app).get('/session/start/test-session').set('x-api-key', 'test_api_key')
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
  })

  it('should check session status', async () => {
    // First create a session
    await request(app).get('/session/start/status-session').set('x-api-key', 'test_api_key')
    
    // Then check its status
    const response = await request(app).get('/session/status/status-session').set('x-api-key', 'test_api_key')
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('state')
  })
})

describe('API Health Checks', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/health').set('x-api-key', 'test_api_key')
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('success', true)
    expect(response.body).toHaveProperty('system')
    expect(response.body).toHaveProperty('sessions')
  })
})
