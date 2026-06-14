import { Test, TestingModule } from '@nestjs/testing';
import { Carrier } from '@prisma/client';

import { ExtractionService } from './extraction.service';
import {
  allegroInPostShipmentFixture,
  allegroMarketingNonShipmentFixture,
  aliExpressDhlShipmentFixture,
  extractionFixtureCases,
} from './fixtures';
import { OpenRouterClient } from './openrouter-client';
import { ExtractionError } from './types';

describe('ExtractionService', () => {
  let service: ExtractionService;
  let completeStructuredJson: jest.Mock;

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

  describe('fixture regression', () => {
    it.each(extractionFixtureCases)(
      '$name',
      async ({ message, openRouterResponse, expected }) => {
        completeStructuredJson.mockResolvedValue(openRouterResponse);

        const result = await service.extractParcelFields(message);

        expect(result.store).toBe(expected.store);

        if (expected.kind === 'non-shipment') {
          expect(result).toEqual({
            store: expected.store,
            trackingNumber: null,
            carrier: Carrier.CUSTOM,
            customCarrierLabel: null,
            description: null,
          });
          return;
        }

        expect(result.trackingNumber).toMatch(
          new RegExp(`^${expected.trackingNumberPrefix}`),
        );
        expect(result.carrier).toBe(expected.carrier);
        expect(result.trackingNumber).toBeTruthy();
      },
    );
  });

  it('returns null tracking contract when tracking number is blank whitespace', async () => {
    completeStructuredJson.mockResolvedValue({
      trackingNumber: '   ',
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: null,
    });

    await expect(
      service.extractParcelFields(allegroMarketingNonShipmentFixture),
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
      service.extractParcelFields(allegroInPostShipmentFixture),
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
        ...aliExpressDhlShipmentFixture,
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
      service.extractParcelFields(allegroInPostShipmentFixture),
    ).rejects.toBeInstanceOf(ExtractionError);
  });
});
