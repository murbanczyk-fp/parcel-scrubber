import { GmailMessage } from '../gmail/types';
import { CARRIER_PROMPT_OPTIONS } from './validate-extracted-fields';

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.4-nano';

export const EXTRACTION_JSON_SCHEMA_NAME = 'extracted_parcel_fields';

function renderCarrierOptionsForPrompt(): string {
  return CARRIER_PROMPT_OPTIONS.map((option) => {
    const hints = option.hints.join(', ');
    return `- ${option.value}: ${option.label} (${hints})`;
  }).join('\n');
}

export function buildExtractionSystemPrompt(): string {
  return [
    'You extract structured shipment fields from Polish e-commerce order and shipping emails (Allegro, AliExpress).',
    'Return JSON only, matching the provided schema.',
    'When the email does not contain a trackable shipment, set trackingNumber to null and use carrier CUSTOM with customCarrierLabel null.',
    'When a shipment is present, pick carrier from this allowed list (use exact enum values):',
    renderCarrierOptionsForPrompt(),
    'Use CUSTOM with a non-empty customCarrierLabel only when the carrier is clearly named but not in the list above.',
    'Set description only when a clear product or order item description is present; otherwise null.',
    'Do not invent tracking numbers or carriers.',
  ].join('\n');
}

export function buildExtractionJsonSchema(): Record<string, unknown> {
  const carrierEnum = CARRIER_PROMPT_OPTIONS.map((option) => option.value);

  return {
    type: 'object',
    properties: {
      trackingNumber: { type: ['string', 'null'] },
      carrier: { type: 'string', enum: carrierEnum },
      customCarrierLabel: { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
    },
    required: [
      'trackingNumber',
      'carrier',
      'customCarrierLabel',
      'description',
    ],
    additionalProperties: false,
  };
}

export function buildExtractionUserContent(message: GmailMessage): string {
  return [
    `From: ${message.from}`,
    `Subject: ${message.subject}`,
    '',
    message.body,
  ].join('\n');
}
