const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

type GaxiosLikeError = {
  response?: { status?: number };
  code?: number | string;
};

export async function retryTransientGmailApiCall<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableGmailError(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function isRetryableGmailError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return status === 429 || (status !== undefined && status >= 500);
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const gaxiosError = error as GaxiosLikeError;
  if (typeof gaxiosError.response?.status === 'number') {
    return gaxiosError.response.status;
  }

  if (typeof gaxiosError.code === 'number') {
    return gaxiosError.code;
  }

  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
