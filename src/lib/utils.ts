import { logger } from './logger.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RetryableError = {
  code?: number;
  response?: {
    status?: number;
  };
};

export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
  operationName = 'operation'
): Promise<T> {
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      const retryableError = error as RetryableError;
      if (attempt === maxRetries) {
        logger.error(
          { error },
          `'${operationName}' failed after ${maxRetries} attempts.`
        );
        throw error;
      }

      const statusCode =
        typeof retryableError.code === 'number'
          ? retryableError.code
          : retryableError.response?.status;

      const isRetryable =
        typeof statusCode === 'number' &&
        (statusCode === 429 || statusCode >= 500);

      if (!isRetryable) {
        logger.error(
          { error },
          `'${operationName}' failed with a non-retryable error.`
        );
        throw error;
      }

      logger.warn(
        `'${operationName}' attempt ${attempt} failed. Retrying in ${delay / 1000}s...`
      );
      await sleep(delay);
      delay *= 2;
      attempt += 1;
    }
  }

  throw new Error('Retry logic exhausted unexpectedly.');
}
