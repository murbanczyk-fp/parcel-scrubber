import { Carrier } from '@prisma/client';

import { ExtractionError } from './types';
import {
  CARRIER_PROMPT_OPTIONS,
  validateExtractedFields,
} from './validate-extracted-fields';

describe('CARRIER_PROMPT_OPTIONS', () => {
  it('lists all five enum values with hints', () => {
    const values = CARRIER_PROMPT_OPTIONS.map((option) => option.value);
    expect(values).toEqual(Object.values(Carrier));
    expect(
      CARRIER_PROMPT_OPTIONS.every(
        (option) => option.label.length > 0 && option.hints.length > 0,
      ),
    ).toBe(true);
  });
});

describe('validateExtractedFields', () => {
  it('accepts each enum carrier with tracking number', () => {
    for (const carrier of Object.values(Carrier)) {
      const result = validateExtractedFields({
        trackingNumber: '520000012680041086770098',
        carrier,
        customCarrierLabel: carrier === Carrier.CUSTOM ? 'GLS' : 'ignored',
        description: '  Test item  ',
      });

      expect(result.carrier).toBe(carrier);
      expect(result.trackingNumber).toBe('520000012680041086770098');
      expect(result.description).toBe('Test item');
      if (carrier === Carrier.CUSTOM) {
        expect(result.customCarrierLabel).toBe('GLS');
      } else {
        expect(result.customCarrierLabel).toBeNull();
      }
    }
  });

  it('trims strings and converts empty strings to null', () => {
    const result = validateExtractedFields({
      trackingNumber: '  ',
      carrier: Carrier.INPOST,
      customCarrierLabel: '  ',
      description: '',
    });

    expect(result.trackingNumber).toBeNull();
    expect(result.description).toBeNull();
    expect(result.customCarrierLabel).toBeNull();
  });

  it('throws when carrier is CUSTOM without label', () => {
    expect(() =>
      validateExtractedFields({
        trackingNumber: '123',
        carrier: Carrier.CUSTOM,
        customCarrierLabel: '   ',
      }),
    ).toThrow(ExtractionError);
  });

  it('throws for invalid carrier', () => {
    expect(() =>
      validateExtractedFields({
        trackingNumber: '123',
        carrier: 'UPS',
      }),
    ).toThrow(ExtractionError);
  });
});
