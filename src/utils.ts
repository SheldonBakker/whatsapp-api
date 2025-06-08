import axios, { AxiosResponse } from 'axios';
import { Response } from 'express';
import { globalApiKey, disabledCallbacks } from './config';

// Circuit breaker states
type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

// Circuit breaker implementation for external API calls
export class CircuitBreaker {
  private failureThreshold: number;
  private resetTimeout: number;
  private state: CircuitBreakerState;
  private failureCount: number;
  private nextAttempt: number;

  constructor(failureThreshold: number = 3, resetTimeout: number = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.nextAttempt = Date.now();
  }

  async exec<T>(
    fn: () => Promise<T>,
    fallback: (error?: Error) => T | Promise<T> | void
  ): Promise<T | void> {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        // Half-open state - try one request
        this.state = 'HALF-OPEN';
      } else {
        return fallback();
      }
    }

    try {
      const response = await fn();
      this.onSuccess();
      return response;
    } catch (error) {
      this.onFailure();
      return fallback(error as Error);
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF-OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}

// Create circuit breaker for webhook requests
const webhookCircuitBreaker = new CircuitBreaker();

// Trigger webhook endpoint with circuit breaker
export const triggerWebhook = (
  webhookURL: string,
  sessionId: string,
  dataType: string,
  data: any
): void => {
  webhookCircuitBreaker.exec(
    // Primary function
    (): Promise<AxiosResponse> => axios.post(
      webhookURL,
      { dataType, data, sessionId },
      {
        headers: { 'x-api-key': globalApiKey },
        timeout: 10000 // Add timeout to prevent hanging requests
      }
    ),
    // Fallback function
    (error?: Error): void => {
      const errorMsg = error ? error.message : 'Circuit is open';
      console.error(`Failed to send webhook (${sessionId}, ${dataType}): ${errorMsg}`);
    }
  ).catch(() => {
    // Ignore errors from webhook calls
  });
};

// Function to send a response with error status and message
export const sendErrorResponse = (res: Response, status: number, message: string): void => {
  res.status(status).json({ success: false, error: message });
};

// Function to wait for a specific item not to be null
export const waitForNestedObject = (
  rootObj: any,
  nestedPath: string,
  maxWaitTime: number = 10000,
  interval: number = 100
): Promise<void> => {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const checkObject = (): void => {
      const nestedObj = nestedPath.split('.').reduce(
        (obj: any, key: string) => obj ? obj[key] : undefined,
        rootObj
      );
      if (nestedObj) {
        // Nested object exists, resolve the promise
        resolve();
      } else if (Date.now() - start > maxWaitTime) {
        // Maximum wait time exceeded, reject the promise
        console.log('Timed out waiting for nested object');
        reject(new Error('Timeout waiting for nested object'));
      } else {
        // Nested object not yet created, continue waiting
        setTimeout(checkObject, interval);
      }
    };
    checkObject();
  });
};

export const checkIfEventisEnabled = (event: string): Promise<boolean> => {
  return new Promise((resolve) => {
    resolve(!disabledCallbacks.includes(event));
  });
};
