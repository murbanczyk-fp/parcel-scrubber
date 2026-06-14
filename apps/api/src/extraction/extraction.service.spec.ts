import { Test, TestingModule } from '@nestjs/testing';
import { Carrier } from '@prisma/client';

import { GmailMessage } from '../gmail/types';
import { ExtractionService } from './extraction.service';
import { OpenRouterClient } from './openrouter-client';
import { ExtractionError } from './types';

describe('ExtractionService', () => {
  let service: ExtractionService;
  let completeStructuredJson: jest.Mock;

  const allegroInPostMessage: GmailMessage = {
    from: 'Allegro <powiadomienia@allegro.pl>',
    date: '2026-01-15T10:00:00.000Z',
    subject: 'Twoja przesyłka została nadana',
    body: [
      'Dzień dobry,',
      '',
      'Twoja przesyłka z zamówienia została nadana.',
      '',
      'Numer przesyłki: 520000012680041086770098',
      'Przewoźnik: InPost Paczkomaty',
      '',
      'Pozdrawiamy, Allegro',
    ].join('\n'),
  };

  const aliExpressDhlMessage: GmailMessage = {
    from: 'AliExpress <transaction@notice.aliexpress.com>',
    date: '2026-02-01T08:30:00.000Z',
    subject: 'Your package has been shipped',
    body: [
      'Hello,',
      '',
      'Your order has shipped.',
      'Tracking number: 3SBCC000123456',
      'Carrier: DHL',
      '',
      'Thank you for shopping with AliExpress.',
    ].join('\n'),
  };

  const allegroMarketingMessage: GmailMessage = {
    from: 'Allegro <powiadomienia@allegromail.pl>',
    date: '2026-03-01T12:00:00.000Z',
    subject: 'Sprawdź nowe promocje na Allegro',
    body: 'Zobacz najlepsze okazje tygodnia. Brak informacji o przesyłce.',
  };

  beforeEach(async () => {
    completeStructuredJson = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionService,
        {
          provide: OpenRouterClient,
          useValue: { completeStructuredJson },
        },
      ],
    }).compile();

    service = module.get(ExtractionService);
  });

  it('merges Allegro store with validated InPost fields', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Smartfon',
    });

    await expect(
      service.extractParcelFields(allegroInPostMessage),
    ).resolves.toEqual({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Smartfon',
    });
  });

  it('merges AliExpress store with validated DHL fields', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '3SBCC000123456',
      carrier: Carrier.DHL,
      customCarrierLabel: null,
      description: null,
    });

    await expect(
      service.extractParcelFields(aliExpressDhlMessage),
    ).resolves.toEqual({
      store: 'AliExpress',
      trackingNumber: '3SBCC000123456',
      carrier: Carrier.DHL,
      customCarrierLabel: null,
      description: null,
    });
  });

  it('returns null tracking contract for non-shipment email while preserving store', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: 'Promocje',
    });

    await expect(
      service.extractParcelFields(allegroMarketingMessage),
    ).resolves.toEqual({
      store: 'Allegro',
      trackingNumber: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: null,
    });
  });

  it('returns null tracking contract when tracking number is blank whitespace', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '   ',
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: null,
    });

    await expect(
      service.extractParcelFields(allegroMarketingMessage),
    ).resolves.toEqual({
      store: 'Allegro',
      trackingNumber: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: null,
    });
  });

  it('throws ExtractionError when CUSTOM shipment lacks customCarrierLabel', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '1234567890',
      carrier: Carrier.CUSTOM,
      customCarrierLabel: '   ',
      description: null,
    });

    await expect(
      service.extractParcelFields(allegroInPostMessage),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it('returns null store for unknown sender', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '1234567890',
      carrier: Carrier.DPD,
      customCarrierLabel: null,
      description: null,
    });

    await expect(
      service.extractParcelFields({
        ...allegroInPostMessage,
        from: 'shop@example.com',
      }),
    ).resolves.toMatchObject({
      store: null,
      trackingNumber: '1234567890',
      carrier: Carrier.DPD,
    });
  });

  it('propagates ExtractionError when OpenRouter fails after retries', async () => {
    completeStructuredJson.mockRejectedValue(
      new ExtractionError('OpenRouter request failed with status 503'),
    );

    await expect(
      service.extractParcelFields(allegroInPostMessage),
    ).rejects.toBeInstanceOf(ExtractionError);
  });
});
