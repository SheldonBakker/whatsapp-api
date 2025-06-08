const { exec } = require('child_process')
const { promisify } = require('util')
const axios = require('axios')

const execAsync = promisify(exec)

/**
 * Docker Test Utilities for WhatsApp API
 * Provides helper functions for testing Docker deployment
 */
class DockerTestUtils {
  constructor (options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:5656'
    this.apiKey = options.apiKey || '0cecfcdb-0cdb-4463-91ba-9f70dbd4f6f2'
    this.containerName = options.containerName || 'whatsapp-api-test'
    this.composeFile = options.composeFile || 'docker-compose.yml'
    this.envFile = options.envFile || '.env.test'
    this.testSessionId = options.testSessionId || 'docker-test-session'
    this.maxRetries = options.maxRetries || 30
    this.retryDelay = options.retryDelay || 5000
  }

  /**
   * Check if Docker is available and running
   */
  async checkDockerAvailability () {
    try {
      await execAsync('docker info')
      return true
    } catch (error) {
      throw new Error('Docker is not running or not available')
    }
  }

  /**
   * Check if Docker Compose is available
   */
  async checkDockerCompose () {
    try {
      await execAsync('docker-compose --version')
      return true
    } catch (error) {
      throw new Error('Docker Compose is not available')
    }
  }

  /**
   * Build and start Docker containers
   */
  async startContainers () {
    console.log('🚀 Building and starting Docker containers...')

    // Stop any existing containers first
    await this.stopContainers()

    // Build and start containers with environment file
    const { stdout, stderr } = await execAsync(`docker-compose -f ${this.composeFile} --env-file ${this.envFile} up -d --build`)

    if (stderr && !stderr.includes('Creating') && !stderr.includes('Starting')) {
      throw new Error(`Failed to start containers: ${stderr}`)
    }

    console.log('✅ Containers started successfully')
    return { stdout, stderr }
  }

  /**
   * Stop Docker containers
   */
  async stopContainers () {
    try {
      await execAsync(`docker-compose -f ${this.composeFile} --env-file ${this.envFile} down`)
      console.log('🛑 Containers stopped')
    } catch (error) {
      // Ignore errors if containers are not running
      console.log('ℹ️ No containers to stop')
    }
  }

  /**
   * Wait for the API service to be ready
   */
  async waitForService () {
    console.log('⏳ Waiting for API service to be ready...')

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.get(`${this.baseUrl}/ping`, {
          timeout: 5000
        })

        if (response.status === 200 && response.data.success) {
          console.log('✅ API service is ready')
          return true
        }
      } catch (error) {
        console.log(`⏳ Attempt ${attempt}/${this.maxRetries} - waiting for service...`)

        if (attempt === this.maxRetries) {
          // Get container logs for debugging
          const logs = await this.getContainerLogs()
          throw new Error(`Service failed to start within ${this.maxRetries} attempts. Logs: ${logs}`)
        }

        await this.sleep(this.retryDelay)
      }
    }

    return false
  }

  /**
   * Test health endpoint
   */
  async testHealthEndpoint () {
    console.log('🏥 Testing health endpoint...')

    const response = await axios.get(`${this.baseUrl}/health`, {
      headers: { 'x-api-key': this.apiKey },
      timeout: 10000
    })

    if (response.status !== 200 || !response.data.success) {
      throw new Error(`Health check failed: ${JSON.stringify(response.data)}`)
    }

    console.log('✅ Health endpoint is working')
    return response.data
  }

  /**
   * Create a new WhatsApp session
   */
  async createSession (sessionId = this.testSessionId) {
    console.log(`📱 Creating WhatsApp session: ${sessionId}`)

    const response = await axios.get(`${this.baseUrl}/session/start/${sessionId}`, {
      headers: { 'x-api-key': this.apiKey },
      timeout: 30000
    })

    if (response.status !== 200) {
      throw new Error(`Session creation failed with status ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.success) {
      throw new Error(`Session creation failed: ${JSON.stringify(response.data)}`)
    }

    console.log('✅ Session created successfully')
    return response.data
  }

  /**
   * Get session status
   */
  async getSessionStatus (sessionId = this.testSessionId) {
    const response = await axios.get(`${this.baseUrl}/session/status/${sessionId}`, {
      headers: { 'x-api-key': this.apiKey },
      timeout: 10000
    })

    return response.data
  }

  /**
   * Wait for QR code to be available
   */
  async waitForQRCode (sessionId = this.testSessionId, maxWaitTime = 60000) {
    console.log(`📱 Waiting for QR code for session: ${sessionId}`)

    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getSessionStatus(sessionId)

        if (status.qrStatus === 'READY_FOR_SCAN' && status.qr) {
          console.log('✅ QR code is ready for scanning')
          return status
        }

        if (status.qrStatus === 'SCANNED_AUTHENTICATED') {
          console.log('✅ QR code already scanned and authenticated')
          return status
        }

        console.log(`⏳ QR Status: ${status.qrStatus}, waiting...`)
        await this.sleep(2000)
      } catch (error) {
        console.log(`⚠️ Error checking QR status: ${error.message}`)
        await this.sleep(2000)
      }
    }

    throw new Error(`QR code not available within ${maxWaitTime}ms`)
  }

  /**
   * Download QR code image
   */
  async downloadQRCodeImage (sessionId = this.testSessionId, outputPath = './qr-code.png') {
    console.log(`📷 Downloading QR code image for session: ${sessionId}`)

    const response = await axios.get(`${this.baseUrl}/session/qr/${sessionId}/image`, {
      headers: { 'x-api-key': this.apiKey },
      responseType: 'stream',
      timeout: 10000
    })

    if (response.status !== 200) {
      throw new Error(`Failed to download QR code: ${response.status}`)
    }

    // Save the image
    const writer = require('fs').createWriteStream(outputPath)
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ QR code saved to: ${outputPath}`)
        resolve(outputPath)
      })
      writer.on('error', reject)
    })
  }

  /**
   * Test message sending (requires authenticated session)
   */
  async testMessageSending (sessionId = this.testSessionId, chatId = null, message = 'Test message from Docker API') {
    if (!chatId) {
      console.log('⚠️ No chat ID provided, skipping message test')
      return { skipped: true, reason: 'No chat ID provided' }
    }

    console.log(`💬 Testing message sending to: ${chatId}`)

    const response = await axios.post(`${this.baseUrl}/client/sendMessage/${sessionId}`, {
      chatId,
      contentType: 'string',
      content: message
    }, {
      headers: { 'x-api-key': this.apiKey },
      timeout: 30000
    })

    if (response.status !== 200 || !response.data.success) {
      throw new Error(`Message sending failed: ${JSON.stringify(response.data)}`)
    }

    console.log('✅ Message sent successfully')
    return response.data
  }

  /**
   * Get container logs
   */
  async getContainerLogs (lines = 50) {
    try {
      const { stdout } = await execAsync(`docker-compose -f ${this.composeFile} --env-file ${this.envFile} logs --tail=${lines} ${this.containerName}`)
      return stdout
    } catch (error) {
      return `Error getting logs: ${error.message}`
    }
  }

  /**
   * Get container stats
   */
  async getContainerStats () {
    try {
      const { stdout } = await execAsync(`docker stats ${this.containerName} --no-stream --format "table {{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}"`)
      return stdout
    } catch (error) {
      return `Error getting stats: ${error.message}`
    }
  }

  /**
   * Cleanup test session
   */
  async cleanupSession (sessionId = this.testSessionId) {
    try {
      console.log(`🧹 Cleaning up session: ${sessionId}`)
      await axios.get(`${this.baseUrl}/session/terminate/${sessionId}`, {
        headers: { 'x-api-key': this.apiKey },
        timeout: 10000
      })
      console.log('✅ Session cleanup completed')
    } catch (error) {
      console.log(`⚠️ Session cleanup error: ${error.message}`)
    }
  }

  /**
   * Sleep utility
   */
  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Validate Docker environment
   */
  async validateDockerEnvironment () {
    console.log('🔍 Validating Docker environment...')

    // Check if container is running
    const { stdout } = await execAsync(`docker ps --filter "name=${this.containerName}" --format "{{.Status}}"`)

    if (!stdout.includes('Up')) {
      throw new Error(`Container ${this.containerName} is not running`)
    }

    // Check Chrome/Chromium availability in container
    try {
      await execAsync(`docker exec ${this.containerName} which chromium-browser`)
      console.log('✅ Chromium browser found in container')
    } catch (error) {
      throw new Error('Chromium browser not found in container')
    }

    // Check environment variables
    const envCheck = await execAsync(`docker exec ${this.containerName} env | grep -E "(PUPPETEER_|CHROME_|NODE_ENV)"`)
    console.log('✅ Environment variables validated')
    console.log(envCheck.stdout)

    return true
  }
}

module.exports = DockerTestUtils
