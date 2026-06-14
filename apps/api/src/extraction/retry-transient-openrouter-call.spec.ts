import {
  OpenRouterHttpError,
  retryTransientOpenRouterCall,
} from './retry-transient-openrouter-call';

describe('retryTransientOpenRouterCall', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns result on first successful attempt', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(retryTransientOpenRouterCall(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 and succeeds on second attempt', async () => {
    const rateLimitError = new OpenRouterHttpError('rate limited', 429);
    const operation = jest
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('ok');

    const promise = retryTransientOpenRouterCall(operation);
    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 5xx with exponential backoff', async () => {
    const serverError = new OpenRouterHttpError('server error', 503);
    const operation = jest
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue('ok');

    const promise = retryTransientOpenRouterCall(operation);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable HTTP errors', async () => {
    const notFoundError = new OpenRouterHttpError('not found', 404);
    const operation = jest.fn().mockRejectedValue(notFoundError);

    await expect(retryTransientOpenRouterCall(operation)).rejects.toBe(
      notFoundError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry JSON parse failures', async () => {
    const parseError = new SyntaxError('Unexpected token');
    const operation = jest.fn().mockRejectedValue(parseError);

    await expect(retryTransientOpenRouterCall(operation)).rejects.toBe(
      parseError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retry attempts', async () => {
    const rateLimitError = new OpenRouterHttpError('rate limited', 429);
    const operation = jest.fn().mockRejectedValue(rateLimitError);

    const promise = retryTransientOpenRouterCall(operation);
    const expectation = expect(promise).rejects.toBe(rateLimitError);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(500);

    await expectation;
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
