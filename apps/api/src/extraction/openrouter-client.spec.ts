import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { OpenRouterClient } from './openrouter-client';
import { ExtractionError } from './types';

const fetchMock = jest.fn<typeof fetch>();

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterClient,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'OPENROUTER_API_KEY') {
                return 'test-api-key';
              }
              throw new Error(`Unexpected config key: ${key}`);
            }),
            get: jest.fn((key: string) => {
              if (key === 'OPENROUTER_MODEL') {
                return undefined;
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    client = module.get(OpenRouterClient);
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns parsed JSON from a successful response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    trackingNumber: '520000012680041086770098',
                    carrier: 'INPOST',
                    customCarrierLabel: null,
                    description: null,
                  }),
                },
              },
            ],
          }),
        ),
    });

    await expect(
      client.completeStructuredJson('system', 'user', { type: 'object' }),
    ).resolves.toEqual({
      trackingNumber: '520000012680041086770098',
      carrier: 'INPOST',
      customCarrierLabel: null,
      description: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:4200',
          'X-Title': 'Parcel Scrubber',
        },
      }),
    );
  });

  it('retries on HTTP 429 and succeeds on second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
            }),
          ),
      });

    const promise = client.completeStructuredJson('system', 'user', {
      type: 'object',
    });
    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws ExtractionError after exhausting HTTP 5xx retries', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('service unavailable'),
    });

    const promise = client.completeStructuredJson('system', 'user', {
      type: 'object',
    });
    const expectation = expect(promise).rejects.toBeInstanceOf(ExtractionError);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(500);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws ExtractionError without retrying non-retryable HTTP errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    });

    await expect(
      client.completeStructuredJson('system', 'user', { type: 'object' }),
    ).rejects.toBeInstanceOf(ExtractionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws ExtractionError when message content is malformed JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [{ message: { content: 'not-json' } }],
          }),
        ),
    });

    await expect(
      client.completeStructuredJson('system', 'user', { type: 'object' }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });
});
