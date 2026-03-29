/**
 * Callback retry logic with exponential backoff.
 * RN-10: 3 attempts: 30s, 2min, 10min.
 */

import { retryFailedCallbacks } from './callback.service.js';

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min
const MAX_ATTEMPTS = 3;
const SCHEDULER_INTERVAL_MS = 30_000; // Check every 30 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;

export function getRetryDelay(attempt: number): number {
  if (attempt >= MAX_ATTEMPTS) return -1; // no more retries
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

export function shouldRetry(attempt: number): boolean {
  return attempt < MAX_ATTEMPTS;
}

/**
 * Start the callback retry scheduler.
 * Runs periodically to check for failed callbacks and retry them.
 */
export function startCallbackRetryScheduler(): void {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      await retryFailedCallbacks();
    } catch (err) {
      console.error('[callback-retry] Error processing retries:', err);
    }
  }, SCHEDULER_INTERVAL_MS);

  console.log('[callback-retry] Callback retry scheduler started');
}

/**
 * Stop the callback retry scheduler.
 */
export function stopCallbackRetryScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[callback-retry] Callback retry scheduler stopped');
}
