import fs from 'fs';
import qrcode from 'qrcode-terminal';
import { sessionFolderPath } from '../config';
import { sendErrorResponse } from '../utils';
import { sessions } from '../sessions';
import os from 'os';
import { runHealthCheck, testHealthCheck } from '../utils/healthCheckScheduler';
import { AuthenticatedRequest, TypedResponse } from '../types';

/**
 * Responds to ping request with 'I am Alive OKAY!'
 */
export const ping = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.tags = ['Various']
  */
  try {
    res.json({ success: true, message: 'I am Alive OKAY!' });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Comprehensive health check that reports system and session status
 */
export const healthCheck = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Get detailed health information about the API and system'
  */
  try {
    // System metrics
    const systemInfo = {
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100)
      },
      cpu: os.cpus().length,
      loadAvg: os.loadavg(),
      platform: os.platform(),
      nodeVersion: process.version
    };

    // Session statistics
    const sessionStats: any = {
      total: sessions.size,
      status: {}
    };

    // Safely collect session states without exposing sensitive info
    try {
      for (const [, client] of sessions.entries()) {
        try {
          if (client && typeof client.getState === 'function') {
            const state = await client.getState() || 'UNKNOWN';
            sessionStats.status[state] = (sessionStats.status[state] || 0) + 1;
          } else {
            sessionStats.status.UNKNOWN = (sessionStats.status.UNKNOWN || 0) + 1;
          }
        } catch (err) {
          sessionStats.status.ERROR = (sessionStats.status.ERROR || 0) + 1;
        }
      }
    } catch (sessErr: any) {
      console.error('Error collecting session stats:', sessErr.message);
      sessionStats.error = 'Failed to collect complete session statistics';
    }

    // Only send response if it hasn't been sent yet
    if (!res.headersSent) {
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        service: 'whatsapp-api',
        system: systemInfo,
        sessions: sessionStats
      });
    }
  } catch (error: any) {
    console.error('Health check error:', error);
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
};

/**
 * Example callback function that generates a QR code and writes a log file
 */
export const Callback = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.tags = ['Various']
  */
  try {
    const { dataType, data } = req.body;
    if (dataType === 'qr') { qrcode.generate(data.qr, { small: true }); }
    fs.writeFile(`${sessionFolderPath}/message_log.txt`, `${JSON.stringify(req.body)}\r\n`, { flag: 'a+' }, _ => _);
    res.json({ success: true });
  } catch (error: any) {
    console.log(error);
    fs.writeFile(`${sessionFolderPath}/message_log.txt`, `(ERROR) ${JSON.stringify(error)}\r\n`, { flag: 'a+' }, _ => _);
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Manually triggers a health check that sends WhatsApp messages to configured recipients
 */
export const triggerHealthCheck = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Manually trigger a health check that sends WhatsApp messages to configured recipients'
  */
  try {
    // Run the health check asynchronously
    runHealthCheck()
      .then(() => {
        console.log('Manual health check completed successfully');
      })
      .catch((error: any) => {
        console.error('Manual health check failed:', error);
      });

    // Respond immediately without waiting for the health check to complete
    res.json({
      success: true,
      message: 'Health check triggered. WhatsApp messages will be sent to configured recipients.'
    });
  } catch (error: any) {
    console.error('Error triggering health check:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Tests the health check with a specific session
 */
export const testHealthCheckWithSession = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Test the health check with a specific session'
  */
  try {
    const { sessionId } = req.params;

    // Check if the session exists
    if (!sessions.has(sessionId)) {
      sendErrorResponse(res, 404, `Session ${sessionId} not found`);
      return;
    }

    // Run the test health check
    const result = await testHealthCheck(sessionId);

    if (result.success) {
      res.json({
        success: true,
        message: `Health check test sent successfully using session ${sessionId}`
      });
    } else {
      sendErrorResponse(res, 500, `Health check test failed: ${result.error}`);
    }
  } catch (error: any) {
    console.error('Error testing health check:', error);
    sendErrorResponse(res, 500, error.message);
  }
};
