import { Carrier } from '@prisma/client';

import { CARRIER_URL_CONTRACT_CASES } from '../../test/fixtures/carrier-url-contract-cases';
import { buildCarrierUrl } from './carrier-url-templates';

describe('buildCarrierUrl', () => {
  it.each(CARRIER_URL_CONTRACT_CASES)(
    'builds the exact $carrier contract URL',
    ({ carrier, trackingNumber, expectedUrl }) => {
      expect(buildCarrierUrl(carrier, trackingNumber)).toBe(expectedUrl);
    },
  );

  it('returns null for CUSTOM carrier', () => {
    expect(buildCarrierUrl(Carrier.CUSTOM, 'ANY123')).toBeNull();
  });

  it('URL-encodes special characters in tracking number', () => {
    expect(buildCarrierUrl(Carrier.DHL, 'A+B/C')).toBe(
      'https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=A%2BB%2FC',
    );
  });
});
