/**
 * Classify errors and decide retry backoff for outbound/Vapi-style failures.
 * Extracted from server.js (retryWithBackoff + Vapi fallbacks).
 */

export function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;

  if (message.includes('timeout') || message.includes('econnreset') || message.includes('enotfound')) {
    return 'network';
  }

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }

  if (status >= 500 && status < 600) {
    return 'server_error';
  }

  if (status >= 400 && status < 500) {
    return 'client_error';
  }

  if (message.includes('vapi') || message.includes('assistant') || message.includes('phone number')) {
    return 'vapi_error';
  }

  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('invalid key')) {
    return 'critical';
  }

  return 'unknown';
}

export function shouldRetryError(errorType, attempt, maxRetries) {
  const retryableErrors = ['network', 'server_error', 'rate_limit'];
  const nonRetryableErrors = ['client_error', 'critical'];

  if (nonRetryableErrors.includes(errorType)) {
    return false;
  }

  if (retryableErrors.includes(errorType)) {
    return attempt < maxRetries;
  }

  return attempt === 1;
}

export function calculateRetryDelay(baseDelay, attempt, errorType) {
  let delay = baseDelay * 2 ** (attempt - 1);

  if (errorType === 'rate_limit') {
    delay = Math.max(delay, 5000);
  }

  const jitter = delay * 0.25 * (Math.random() - 0.5);
  delay = Math.max(100, delay + jitter);

  return Math.floor(delay);
}
