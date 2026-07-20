import {
  buildCarrierConflict,
  buildTextFieldConflicts,
  formatCarrierOption,
  isMergeFormComplete,
  MERGE_FIELD_LABELS,
  previewOrderDate,
  resolveMergeFields,
  unanimousCarrier,
  unanimousTextValue,
} from './merge-field-options';
import type { ParcelDto } from '../../core/parcels/parcels.types';

describe('merge-field-options', () => {
  const base: ParcelDto = {
    id: 'p1',
    store: 'Allegro',
    description: 'A',
    carrier: 'INPOST',
    customCarrierLabel: null,
    trackingNumber: 'T1',
    trackingUrl: 'https://inpost.pl/t1',
    trackingUrlOverride: null,
    orderDate: '2026-02-01',
    status: 'NEW',
    source: 'GMAIL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  };

  it('builds distinct non-empty text options and omits empty duplicates', () => {
    const conflicts = buildTextFieldConflicts([
      { ...base, id: 'a', description: 'Alpha' },
      { ...base, id: 'b', description: 'Beta' },
      { ...base, id: 'c', description: null },
    ]);

    const description = conflicts.find((c) => c.field === 'description');
    expect(description?.options).toEqual(['Alpha', 'Beta']);
  });

  it('skips unanimous text fields', () => {
    const conflicts = buildTextFieldConflicts([
      { ...base, id: 'a', store: 'Shop' },
      { ...base, id: 'b', store: 'Shop' },
    ]);

    expect(conflicts.find((c) => c.field === 'store')).toBeUndefined();
  });

  it('builds carrier conflict options with custom labels', () => {
    const conflict = buildCarrierConflict([
      { ...base, id: 'a', carrier: 'INPOST' },
      {
        ...base,
        id: 'b',
        carrier: 'CUSTOM',
        customCarrierLabel: 'Bike courier',
      },
    ]);

    expect(conflict?.options).toEqual([
      {
        carrier: 'INPOST',
        customCarrierLabel: null,
        label: 'InPost',
      },
      {
        carrier: 'CUSTOM',
        customCarrierLabel: 'Bike courier',
        label: 'Bike courier',
      },
    ]);
    expect(formatCarrierOption('DHL', null)).toBe('DHL');
  });

  it('previews order date from oldest message then falls back to parcels', () => {
    expect(
      previewOrderDate([
        {
          ...base,
          orderDate: '2026-03-01',
          messages: [
            {
              gmailMessageId: 'm1',
              internalDate: '2026-01-15T10:00:00.000Z',
              subject: null,
              from: null,
            },
          ],
        },
        {
          ...base,
          id: 'p2',
          orderDate: '2026-01-01',
          messages: [
            {
              gmailMessageId: 'm2',
              internalDate: '2026-02-01T10:00:00.000Z',
              subject: null,
              from: null,
            },
          ],
        },
      ]),
    ).toBe('2026-01-15');

    expect(
      previewOrderDate([
        { ...base, orderDate: '2026-03-01', messages: [] },
        { ...base, id: 'p2', orderDate: '2026-01-05', messages: [] },
      ]),
    ).toBe('2026-01-05');
  });

  it('resolves merge fields from choices including Other and Leave empty', () => {
    const parcels = [
      { ...base, id: 'a', description: 'Alpha', store: 'Shop A' },
      { ...base, id: 'b', description: 'Beta', store: 'Shop B' },
    ];
    const textConflicts = buildTextFieldConflicts(parcels);
    const fields = resolveMergeFields({
      parcels,
      textConflicts,
      textChoices: {
        store: { kind: 'empty' },
        description: { kind: 'other' },
        trackingNumber: { kind: 'value', value: 'T1' },
        trackingUrl: { kind: 'empty' },
      },
      otherText: { description: 'Custom desc' },
      carrierChoice: null,
      otherCarrierLabel: '',
      carrierConflict: null,
    });

    expect(fields.store).toBeNull();
    expect(fields.description).toBe('Custom desc');
    expect(fields.trackingNumber).toBe('T1');
    expect(unanimousTextValue(parcels, 'trackingNumber')).toBe('T1');
    expect(unanimousCarrier(parcels).carrier).toBe('INPOST');
  });

  it('requires Other text before the form is complete', () => {
    const parcels = [
      { ...base, id: 'a', description: 'Alpha', store: 'Same' },
      { ...base, id: 'b', description: 'Beta', store: 'Same' },
    ];
    const textConflicts = buildTextFieldConflicts(parcels);

    expect(textConflicts.map((c) => c.field)).toEqual(['description']);

    expect(
      isMergeFormComplete({
        textConflicts,
        textChoices: { description: { kind: 'other' } },
        otherText: { description: '  ' },
        carrierConflict: null,
        carrierChoice: null,
        otherCarrierLabel: '',
      }),
    ).toBe(false);

    expect(
      isMergeFormComplete({
        textConflicts,
        textChoices: { description: { kind: 'other' } },
        otherText: { description: 'Done' },
        carrierConflict: null,
        carrierChoice: null,
        otherCarrierLabel: '',
      }),
    ).toBe(true);

    expect(MERGE_FIELD_LABELS.description).toBe('Description');
  });
});
