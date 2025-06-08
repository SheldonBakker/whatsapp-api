import { logger } from './logger';
import { sessions, validateSession } from '../sessions';
import { SessionRecovery } from './sessionRecovery';

export class SessionHealthMonitor {
  private static healthCheckInterval: NodeJS.Timeout | null = null;
  private static readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static sessionFailureCounts = new Map<string, number>();

  /**
   * Start monitoring session health
   */
  static startMonitoring(): void {
    if (this.healthCheckInterval) {
      logger.warn('Session health monitoring is already running');
      return;
    }

    logger.info('Starting session health monitoring', { 
      interval: this.HEALTH_CHECK_INTERVAL / 1000 + ' seconds' 
    });

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop monitoring session health
   */
  static stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Session health monitoring stopped');
    }
  }

  /**
   * Perform health check on all active sessions
   */
  static async performHealthCheck(): Promise<void> {
    const activeSessionIds = Array.from(sessions.keys());
    
    if (activeSessionIds.length === 0) {
      logger.debug('No active sessions to monitor');
      return;
    }

    logger.info(`Performing health check on ${activeSessionIds.length} active sessions`);

    for (const sessionId of activeSessionIds) {
      await this.checkSessionHealth(sessionId);
    }
  }

  /**
   * Check health of a specific session
   */
  static async checkSessionHealth(sessionId: string): Promise<void> {
    const logContext = { sessionId };
    
    try {
      const validation = await validateSession(sessionId);
      const client = sessions.get(sessionId);
      
      if (!client) {
        logger.warn('Session not found in memory during health check', logContext);
        this.incrementFailureCount(sessionId);
        return;
      }

      // Check if client is in a healthy state
      const isHealthy = validation.success && 
                       !client._destroyed && 
                       !client._initializing &&
                       validation.state === 'CONNECTED';

      if (isHealthy) {
        // Session is healthy, reset failure count
        this.resetFailureCount(sessionId);
        logger.debug('Session health check passed', logContext);
      } else {
        // Session is unhealthy
        const failureCount = this.incrementFailureCount(sessionId);
        logger.warn(`Session health check failed`, { 
          ...logContext, 
          validation,
          failureCount,
          clientDestroyed: client._destroyed,
          clientInitializing: client._initializing
        });

        // If we've reached max failures, attempt recovery
        if (failureCount >= this.MAX_CONSECUTIVE_FAILURES) {
          logger.error(`Session has failed ${failureCount} consecutive health checks. Attempting recovery.`, logContext);
          await this.attemptSessionRecovery(sessionId);
        }
      }
    } catch (error: any) {
      const failureCount = this.incrementFailureCount(sessionId);
      logger.error(`Error during session health check: ${error.message}`, { 
        ...logContext, 
        error,
        failureCount 
      });

      if (failureCount >= this.MAX_CONSECUTIVE_FAILURES) {
        logger.error(`Session has failed ${failureCount} consecutive health checks due to errors. Attempting recovery.`, logContext);
        await this.attemptSessionRecovery(sessionId);
      }
    }
  }

  /**
   * Attempt to recover an unhealthy session
   */
  private static async attemptSessionRecovery(sessionId: string): Promise<void> {
    const logContext = { sessionId };
    
    try {
      logger.info('Starting automatic session recovery due to health check failures', logContext);
      
      const recoveryResult = await SessionRecovery.recoverSession(sessionId);
      
      if (recoveryResult.success) {
        logger.info(`Session recovery successful: ${recoveryResult.message}`, { 
          ...logContext, 
          recoveryResult 
        });
        this.resetFailureCount(sessionId);
      } else {
        logger.error(`Session recovery failed: ${recoveryResult.message}`, { 
          ...logContext, 
          recoveryResult 
        });
        // Keep the failure count high to prevent immediate retry
      }
    } catch (error: any) {
      logger.error(`Error during automatic session recovery: ${error.message}`, { 
        ...logContext, 
        error 
      });
    }
  }

  /**
   * Increment failure count for a session
   */
  private static incrementFailureCount(sessionId: string): number {
    const currentCount = this.sessionFailureCounts.get(sessionId) || 0;
    const newCount = currentCount + 1;
    this.sessionFailureCounts.set(sessionId, newCount);
    return newCount;
  }

  /**
   * Reset failure count for a session
   */
  private static resetFailureCount(sessionId: string): void {
    this.sessionFailureCounts.delete(sessionId);
  }

  /**
   * Get current failure count for a session
   */
  static getFailureCount(sessionId: string): number {
    return this.sessionFailureCounts.get(sessionId) || 0;
  }

  /**
   * Get health status of all sessions
   */
  static async getHealthStatus(): Promise<{
    totalSessions: number;
    healthySessions: number;
    unhealthySessions: number;
    sessionDetails: Array<{
      sessionId: string;
      isHealthy: boolean;
      failureCount: number;
      state?: string;
      message?: string;
    }>;
  }> {
    const activeSessionIds = Array.from(sessions.keys());
    const sessionDetails = [];
    let healthySessions = 0;
    let unhealthySessions = 0;

    for (const sessionId of activeSessionIds) {
      try {
        const validation = await validateSession(sessionId);
        const client = sessions.get(sessionId);
        const failureCount = this.getFailureCount(sessionId);
        
        const isHealthy = !!(validation.success &&
                            client &&
                            !client._destroyed &&
                            !client._initializing &&
                            validation.state === 'CONNECTED');

        if (isHealthy) {
          healthySessions++;
        } else {
          unhealthySessions++;
        }

        sessionDetails.push({
          sessionId,
          isHealthy,
          failureCount,
          state: validation.state || 'UNKNOWN',
          message: validation.message
        });
      } catch (error: any) {
        unhealthySessions++;
        sessionDetails.push({
          sessionId,
          isHealthy: false,
          failureCount: this.getFailureCount(sessionId),
          state: 'ERROR',
          message: error.message
        });
      }
    }

    return {
      totalSessions: activeSessionIds.length,
      healthySessions,
      unhealthySessions,
      sessionDetails
    };
  }
}
