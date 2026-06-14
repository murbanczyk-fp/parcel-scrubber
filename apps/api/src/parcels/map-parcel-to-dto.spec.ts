import { Carrier, ParcelSource, ParcelStatus } from '@prisma/client';

import { mapParcelToDto } from './map-parcel-to-dto';
import { resolveTrackingUrl } from './resolve-tracking-url';

describe('mapParcelToDto', () => {
  const baseParcel = {
    id: 'parcel-1',
    userId: 'user-1',
    store: 'Allegro',
    description: 'Etui',
    customCarrierLabel: null,
    carrier: Carrier.INPOST,
    trackingNumber: '520000012680041086770098',
    trackingUrl: null,
    orderDate: new Date('2026-01-15T00:00:00.000Z'),
    status: ParcelStatus.NEW,
    source: ParcelSource.GMAIL,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-16T10:00:00.000Z'),
  } satisfies Parameters<typeof mapParcelToDto>[0];

  it('maps parcel fields and resolves tracking URL', () => {
    const dto = mapParcelToDto(baseParcel);

    expect(dto).toEqual({
      id: 'parcel-1',
      store: 'Allegro',
      description: 'Etui',
      carrier: 'INPOST',
      customCarrierLabel: null,
      trackingNumber: '520000012680041086770098',
      trackingUrl: resolveTrackingUrl(baseParcel),
      orderDate: '2026-01-15',
      status: ParcelStatus.NEW,
      source: ParcelSource.GMAIL,
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-16T10:00:00.000Z',
    });
  });

  it('returns null trackingUrl for CUSTOM carrier without override', () => {
    const dto = mapParcelToDto({
      ...baseParcel,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: 'Local courier',
    });

    expect(dto.trackingUrl).toBeNull();
  });
});
