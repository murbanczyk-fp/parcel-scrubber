const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

type HttpLikeError = {
  status?: number;
  response?: { status?: number };
};

export class OpenRouterHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = 'OpenRouterHttpError';
  }
}

export async function retryTransientOpenRouterCall<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableOpenRouterError(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function isRetryableOpenRouterError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return status === 429 || (status !== undefined && status >= 500);
}

function getHttpStatus(error: unknown): number | undefined {
  if (error instanceof OpenRouterHttpError) {
    return error.status;
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const httpError = error as HttpLikeError;
  if (typeof httpError.status === 'number') {
    return httpError.status;
  }

  if (typeof httpError.response?.status === 'number') {
    return httpError.response.status;
  }

  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
