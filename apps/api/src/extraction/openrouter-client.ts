import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_OPENROUTER_MODEL,
  EXTRACTION_JSON_SCHEMA_NAME,
} from './extraction-prompt';
import {
  OpenRouterHttpError,
  retryTransientOpenRouterCall,
} from './retry-transient-openrouter-call';
import { ExtractionError } from './types';

const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions';
const APP_TITLE = 'Parcel Scrubber';
const OPENROUTER_REQUEST_TIMEOUT_MS = 60_000;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

@Injectable()
export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY');
    this.model =
      this.config.get<string>('OPENROUTER_MODEL') ?? DEFAULT_OPENROUTER_MODEL;
  }

  async completeStructuredJson(
    systemPrompt: string,
    userContent: string,
    schema: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      return await retryTransientOpenRouterCall(async () => {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': APP_TITLE,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: EXTRACTION_JSON_SCHEMA_NAME,
                strict: true,
                schema,
              },
            },
          }),
        });

        const bodyText = await response.text();
        if (!response.ok) {
          throw new OpenRouterHttpError(
            `OpenRouter request failed with status ${response.status}`,
            response.status,
          );
        }

        return parseStructuredJsonContent(bodyText);
      });
    } catch (error) {
      if (error instanceof ExtractionError) {
        throw error;
      }

      if (error instanceof OpenRouterHttpError) {
        throw new ExtractionError(error.message, error);
      }

      throw new ExtractionError('OpenRouter request failed', error);
    }
  }
}

function parseStructuredJsonContent(bodyText: string): Record<string, unknown> {
  let payload: ChatCompletionResponse;
  try {
    payload = JSON.parse(bodyText) as ChatCompletionResponse;
  } catch (error) {
    throw new ExtractionError('OpenRouter response was not valid JSON', error);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ExtractionError('OpenRouter response missing message content');
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new ExtractionError(
      'OpenRouter message content was not valid JSON',
      error,
    );
  }
}
