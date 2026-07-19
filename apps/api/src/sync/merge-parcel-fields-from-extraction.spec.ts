import { Carrier } from '@prisma/client';

import {
  mergeParcelFieldsFromExtraction,
  type ParcelFieldData,
} from './merge-parcel-fields-from-extraction';

function existing(overrides: Partial<ParcelFieldData> = {}): ParcelFieldData {
  return {
    store: null,
    description: null,
    carrier: Carrier.CUSTOM,
    customCarrierLabel: null,
    ...overrides,
  };
}

describe('mergeParcelFieldsFromExtraction', () => {
  it('returns extraction fields as-is on create', () => {
    expect(
      mergeParcelFieldsFromExtraction(null, {
        store: 'Allegro',
        description: 'Phone case',
        carrier: Carrier.INPOST,
        customCarrierLabel: null,
      }),
    ).toEqual({
      store: 'Allegro',
      description: 'Phone case',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
    });
  });

  it('fills empty store and description from extraction', () => {
    expect(
      mergeParcelFieldsFromExtraction(existing(), {
        store: 'Allegro',
        description: 'Phone case',
        carrier: Carrier.CUSTOM,
        customCarrierLabel: 'Bike courier',
      }),
    ).toEqual({
      store: 'Allegro',
      description: 'Phone case',
      carrier: Carrier.CUSTOM,
      customCarrierLabel: 'Bike courier',
    });
  });

  it('preserves non-empty store and description', () => {
    expect(
      mergeParcelFieldsFromExtraction(
        existing({
          store: 'AliExpress',
          description: 'User edit',
          carrier: Carrier.INPOST,
        }),
        {
          store: 'Allegro',
          description: 'Merchant text',
          carrier: Carrier.DPD,
          customCarrierLabel: null,
        },
      ),
    ).toEqual({
      store: 'AliExpress',
      description: 'User edit',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
    });
  });

  it('treats whitespace-only strings as empty', () => {
    expect(
      mergeParcelFieldsFromExtraction(
        existing({
          store: '   ',
          description: '\t',
          customCarrierLabel: '  ',
        }),
        {
          store: 'Allegro',
          description: 'Filled',
          carrier: Carrier.CUSTOM,
          customCarrierLabel: 'GLS',
        },
      ),
    ).toEqual({
      store: 'Allegro',
      description: 'Filled',
      carrier: Carrier.CUSTOM,
      customCarrierLabel: 'GLS',
    });
  });

  it('upgrades CUSTOM carrier to a known carrier and clears customCarrierLabel', () => {
    expect(
      mergeParcelFieldsFromExtraction(
        existing({
          customCarrierLabel: 'Unknown courier',
        }),
        {
          store: null,
          description: null,
          carrier: Carrier.INPOST,
          customCarrierLabel: null,
        },
      ),
    ).toEqual({
      store: null,
      description: null,
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
    });
  });

  it('does not downgrade a known carrier to CUSTOM', () => {
    expect(
      mergeParcelFieldsFromExtraction(
        existing({
          carrier: Carrier.DPD,
        }),
        {
          store: null,
          description: null,
          carrier: Carrier.CUSTOM,
          customCarrierLabel: 'Something',
        },
      ),
    ).toEqual({
      store: null,
      description: null,
      carrier: Carrier.DPD,
      customCarrierLabel: null,
    });
  });

  it('clears customCarrierLabel when merged carrier stays non-CUSTOM', () => {
    expect(
      mergeParcelFieldsFromExtraction(
        existing({
          carrier: Carrier.INPOST,
          customCarrierLabel: 'stale label',
        }),
        {
          store: null,
          description: null,
          carrier: Carrier.INPOST,
          customCarrierLabel: 'ignored',
        },
      ),
    ).toEqual({
      store: null,
      description: null,
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
    });
  });

  it('fills customCarrierLabel only when both sides are CUSTOM and existing label is empty', () => {
    expect(
      mergeParcelFieldsFromExtraction(existing(), {
        store: null,
        description: null,
        carrier: Carrier.CUSTOM,
        customCarrierLabel: 'Bike courier',
      }),
    ).toEqual({
      store: null,
      description: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: 'Bike courier',
    });

    expect(
      mergeParcelFieldsFromExtraction(
        existing({ customCarrierLabel: 'Keep me' }),
        {
          store: null,
          description: null,
          carrier: Carrier.CUSTOM,
          customCarrierLabel: 'Replace me',
        },
      ),
    ).toEqual({
      store: null,
      description: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: 'Keep me',
    });
  });
});
