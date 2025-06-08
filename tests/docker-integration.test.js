const DockerTestUtils = require('./docker-test-utils');
const path = require('path');
const fs = require('fs').promises;

describe('WhatsApp API Docker Integration Tests', () => {
  let dockerUtils;
  const testSessionId = 'docker-integration-test';
  const qrCodePath = path.join(__dirname, 'test-qr-code.png');

  beforeAll(async () => {
    // Initialize Docker test utilities
    dockerUtils = new DockerTestUtils({
      testSessionId: testSessionId,
      maxRetries: 30,
      retryDelay: 5000
    });

    console.log('🚀 Starting Docker Integration Tests');
    console.log('=====================================');

    // Check Docker prerequisites
    await dockerUtils.checkDockerAvailability();
    await dockerUtils.checkDockerCompose();
  }, 60000);

  afterAll(async () => {
    // Cleanup
    if (dockerUtils) {
      await dockerUtils.cleanupSession(testSessionId);
      
      // Clean up test files
      try {
        await fs.unlink(qrCodePath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }

    console.log('🧹 Docker Integration Tests Cleanup Complete');
  }, 30000);

  describe('Container Setup and Environment', () => {
    test('should build and start Docker containers', async () => {
      const result = await dockerUtils.startContainers();
      expect(result).toBeDefined();
      expect(result.stdout || result.stderr).toContain('whatsapp-api');
    }, 120000);

    test('should wait for API service to be ready', async () => {
      const isReady = await dockerUtils.waitForService();
      expect(isReady).toBe(true);
    }, 180000);

    test('should validate Docker environment configuration', async () => {
      const isValid = await dockerUtils.validateDockerEnvironment();
      expect(isValid).toBe(true);
    }, 30000);

    test('should have proper Chrome/Chromium setup for Puppeteer', async () => {
      // This is tested as part of validateDockerEnvironment
      // but we can add specific checks here
      const logs = await dockerUtils.getContainerLogs(20);
      
      // Check that there are no critical Chrome/Puppeteer errors
      expect(logs).not.toMatch(/Chrome crashed/i);
      expect(logs).not.toMatch(/Puppeteer.*error/i);
    }, 15000);
  });

  describe('API Health and Basic Functionality', () => {
    test('should respond to health check endpoint', async () => {
      const healthData = await dockerUtils.testHealthEndpoint();

      expect(healthData).toBeDefined();
      expect(healthData.success).toBe(true);
      expect(healthData).toHaveProperty('service');
      expect(healthData).toHaveProperty('system');
      expect(healthData).toHaveProperty('sessions');
      expect(healthData).toHaveProperty('timestamp');
      expect(healthData.service).toBe('whatsapp-api');
    }, 30000);

    test('should have proper port mapping and API access', async () => {
      // Test that we can reach the API on the expected port
      const response = await dockerUtils.testHealthEndpoint();
      expect(response.success).toBe(true);
    }, 15000);
  });

  describe('WhatsApp Session Management', () => {
    test('should create a new WhatsApp session', async () => {
      const sessionData = await dockerUtils.createSession(testSessionId);

      expect(sessionData).toBeDefined();
      expect(sessionData.success).toBe(true);
      expect(sessionData).toHaveProperty('message');
      expect(sessionData).toHaveProperty('state');
      // Session should be in INITIALIZING state initially
      expect(['INITIALIZING', 'STARTING']).toContain(sessionData.state);
    }, 60000);

    test('should generate session status information', async () => {
      // Wait a bit for session to initialize
      await dockerUtils.sleep(10000);
      
      const status = await dockerUtils.getSessionStatus(testSessionId);
      
      expect(status).toBeDefined();
      expect(status.success).toBe(true);
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('qrStatus');
      
      // State should be one of the expected values
      const validStates = ['INITIALIZING', 'SCAN_QR_CODE', 'CONNECTED', 'STARTING'];
      expect(validStates).toContain(status.state);
    }, 30000);

    test('should wait for QR code generation', async () => {
      const qrStatus = await dockerUtils.waitForQRCode(testSessionId, 90000);
      
      expect(qrStatus).toBeDefined();
      expect(qrStatus.qrStatus).toBe('READY_FOR_SCAN');
      expect(qrStatus.qr).toBeDefined();
      expect(typeof qrStatus.qr).toBe('string');
      expect(qrStatus.qr.length).toBeGreaterThan(0);
    }, 120000);

    test('should download QR code as image', async () => {
      const imagePath = await dockerUtils.downloadQRCodeImage(testSessionId, qrCodePath);
      
      expect(imagePath).toBe(qrCodePath);
      
      // Verify file exists and has content
      const stats = await fs.stat(qrCodePath);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.isFile()).toBe(true);
    }, 30000);

    test('should handle session status monitoring', async () => {
      // Test multiple status checks to ensure consistency
      for (let i = 0; i < 3; i++) {
        const status = await dockerUtils.getSessionStatus(testSessionId);
        expect(status.success).toBe(true);
        expect(status.qrStatus).toBeDefined();
        
        await dockerUtils.sleep(2000);
      }
    }, 20000);
  });

  describe('QR Code Authentication Workflow', () => {
    test('should maintain QR code availability for scanning', async () => {
      const status = await dockerUtils.getSessionStatus(testSessionId);
      
      // QR should still be available for scanning
      expect(['READY_FOR_SCAN', 'SCANNED_AUTHENTICATED']).toContain(status.qrStatus);
      
      if (status.qrStatus === 'READY_FOR_SCAN') {
        expect(status.qr).toBeDefined();
        console.log('📱 QR Code is ready for manual scanning');
        console.log('🔗 You can scan the QR code from the downloaded image at:', qrCodePath);
        console.log('⏳ The test will continue without requiring actual scanning');
      }
    }, 15000);

    test('should handle authentication state transitions', async () => {
      // Monitor session for a short period to see state changes
      const initialStatus = await dockerUtils.getSessionStatus(testSessionId);
      
      // Wait and check again
      await dockerUtils.sleep(5000);
      const laterStatus = await dockerUtils.getSessionStatus(testSessionId);
      
      // Both should be valid states
      const validStates = ['INITIALIZING', 'SCAN_QR_CODE', 'CONNECTED', 'STARTING'];
      expect(validStates).toContain(initialStatus.state);
      expect(validStates).toContain(laterStatus.state);
      
      console.log(`📊 Session state transition: ${initialStatus.state} -> ${laterStatus.state}`);
    }, 15000);
  });

  describe('Message Sending Capability', () => {
    test('should be ready for message sending (when authenticated)', async () => {
      const status = await dockerUtils.getSessionStatus(testSessionId);
      
      if (status.state === 'CONNECTED') {
        console.log('✅ Session is connected and ready for messaging');
        
        // Test message sending endpoint availability (without actual sending)
        // We'll test the endpoint structure rather than sending actual messages
        const testResult = await dockerUtils.testMessageSending(testSessionId, null);
        expect(testResult.skipped).toBe(true);
        expect(testResult.reason).toContain('No chat ID');
      } else {
        console.log(`ℹ️ Session not connected (${status.state}), message sending test skipped`);
        console.log('📱 To test message sending, scan the QR code and run the test again');
      }
    }, 15000);

    test('should validate message endpoint structure', async () => {
      // Test that the message endpoint exists and responds appropriately
      try {
        await dockerUtils.testMessageSending(testSessionId, 'invalid-chat-id', 'test');
      } catch (error) {
        // We expect this to fail, but it should fail with a proper API response
        expect(error.message).toContain('failed');
        // The endpoint should be reachable (not a network error)
        expect(error.message).not.toContain('ECONNREFUSED');
      }
    }, 15000);
  });

  describe('Container Resource Management', () => {
    test('should monitor container resource usage', async () => {
      const stats = await dockerUtils.getContainerStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('string');
      expect(stats.length).toBeGreaterThan(0);
      
      console.log('📊 Container Resource Usage:');
      console.log(stats);
    }, 15000);

    test('should check container logs for errors', async () => {
      const logs = await dockerUtils.getContainerLogs(50);
      
      expect(logs).toBeDefined();
      expect(typeof logs).toBe('string');
      
      // Check for critical errors (but allow warnings)
      const criticalErrors = logs.match(/ERROR.*critical|FATAL|crashed/gi);
      if (criticalErrors) {
        console.warn('⚠️ Critical errors found in logs:', criticalErrors);
      }
      
      // Should not have too many critical errors
      expect(criticalErrors?.length || 0).toBeLessThan(5);
      
      console.log('📋 Recent container logs checked for critical errors');
    }, 15000);
  });

  describe('Session Cleanup and Termination', () => {
    test('should properly terminate test session', async () => {
      await dockerUtils.cleanupSession(testSessionId);
      
      // Verify session is terminated
      await dockerUtils.sleep(2000);
      
      try {
        const status = await dockerUtils.getSessionStatus(testSessionId);
        // Session might still exist but should be in a terminated state
        if (status.success) {
          expect(['TERMINATED', 'NOT_FOUND', 'ERROR']).toContain(status.state);
        }
      } catch (error) {
        // It's okay if the session is not found after termination
        expect(error.response?.status).toBe(404);
      }
    }, 30000);
  });
});
