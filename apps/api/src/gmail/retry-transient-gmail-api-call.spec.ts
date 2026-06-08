import { retryTransientGmailApiCall } from './retry-transient-gmail-api-call';

describe('retryTransientGmailApiCall', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns result on first successful attempt', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(retryTransientGmailApiCall(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 and succeeds on second attempt', async () => {
    const rateLimitError = { response: { status: 429 } };
    const operation = jest
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('ok');

    const promise = retryTransientGmailApiCall(operation);
    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 5xx with exponential backoff', async () => {
    const serverError = { response: { status: 503 } };
    const operation = jest
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue('ok');

    const promise = retryTransientGmailApiCall(operation);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable HTTP errors', async () => {
    const notFoundError = { response: { status: 404 } };
    const operation = jest.fn().mockRejectedValue(notFoundError);

    await expect(retryTransientGmailApiCall(operation)).rejects.toBe(
      notFoundError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retry attempts', async () => {
    const rateLimitError = { response: { status: 429 } };
    const operation = jest.fn().mockRejectedValue(rateLimitError);

    const promise = retryTransientGmailApiCall(operation);
    const expectation = expect(promise).rejects.toBe(rateLimitError);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(500);

    await expectation;
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
