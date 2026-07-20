import type {
  MergeParcelsFields,
  ParcelCarrier,
  ParcelDto,
} from '../../core/parcels/parcels.types';

export type NullableMergeField =
  | 'store'
  | 'description'
  | 'trackingNumber'
  | 'trackingUrl';

export type FieldChoice =
  | { kind: 'value'; value: string }
  | { kind: 'empty' }
  | { kind: 'other' };

export type CarrierChoice =
  | {
      kind: 'value';
      carrier: ParcelCarrier;
      customCarrierLabel: string | null;
    }
  | { kind: 'other' };

export type TextFieldConflict = {
  field: NullableMergeField;
  options: string[];
};

export type CarrierConflict = {
  options: {
    carrier: ParcelCarrier;
    customCarrierLabel: string | null;
    label: string;
  }[];
};

const CARRIER_LABELS: Record<ParcelCarrier, string> = {
  INPOST: 'InPost',
  POCZTA_POLSKA: 'Poczta Polska',
  DPD: 'DPD',
  DHL: 'DHL',
  CUSTOM: 'Custom',
};

function distinctNonEmpty(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (value == null) {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function unanimousNullable(
  values: (string | null | undefined)[],
): string | null | undefined {
  const normalized = values.map((value) => {
    if (value == null || value.trim().length === 0) {
      return null;
    }
    return value.trim();
  });

  const first = normalized[0];
  return normalized.every((value) => value === first) ? first : undefined;
}

export function buildTextFieldConflicts(
  parcels: ParcelDto[],
): TextFieldConflict[] {
  const fields: {
    field: NullableMergeField;
    read: (parcel: ParcelDto) => string | null;
  }[] = [
    { field: 'store', read: (parcel) => parcel.store },
    { field: 'description', read: (parcel) => parcel.description },
    { field: 'trackingNumber', read: (parcel) => parcel.trackingNumber },
    { field: 'trackingUrl', read: (parcel) => parcel.trackingUrlOverride },
  ];

  const conflicts: TextFieldConflict[] = [];

  for (const { field, read } of fields) {
    const values = parcels.map(read);
    if (unanimousNullable(values) !== undefined) {
      continue;
    }

    conflicts.push({
      field,
      options: distinctNonEmpty(values),
    });
  }

  return conflicts;
}

export function buildCarrierConflict(
  parcels: ParcelDto[],
): CarrierConflict | null {
  const keys = parcels.map(
    (parcel) => `${parcel.carrier}\0${parcel.customCarrierLabel ?? ''}`,
  );
  const first = keys[0];
  if (keys.every((key) => key === first)) {
    return null;
  }

  const seen = new Set<string>();
  const options: CarrierConflict['options'] = [];

  for (const parcel of parcels) {
    const key = `${parcel.carrier}\0${parcel.customCarrierLabel ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    options.push({
      carrier: parcel.carrier,
      customCarrierLabel: parcel.customCarrierLabel,
      label: formatCarrierOption(parcel.carrier, parcel.customCarrierLabel),
    });
  }

  return { options };
}

export function formatCarrierOption(
  carrier: ParcelCarrier,
  customCarrierLabel: string | null,
): string {
  if (carrier === 'CUSTOM') {
    return customCarrierLabel?.trim() || CARRIER_LABELS.CUSTOM;
  }
  return CARRIER_LABELS[carrier];
}

export function unanimousTextValue(
  parcels: ParcelDto[],
  field: NullableMergeField,
): string | null {
  const read = (parcel: ParcelDto): string | null => {
    switch (field) {
      case 'store':
        return parcel.store;
      case 'description':
        return parcel.description;
      case 'trackingNumber':
        return parcel.trackingNumber;
      case 'trackingUrl':
        return parcel.trackingUrlOverride;
    }
  };

  return unanimousNullable(parcels.map(read)) ?? null;
}

export function unanimousCarrier(
  parcels: ParcelDto[],
): { carrier: ParcelCarrier; customCarrierLabel: string | null } {
  return {
    carrier: parcels[0]?.carrier ?? 'CUSTOM',
    customCarrierLabel: parcels[0]?.customCarrierLabel ?? null,
  };
}

/** Preview order date: oldest linked message date, else min parcel orderDate. */
export function previewOrderDate(parcels: ParcelDto[]): string {
  const messageDates = parcels.flatMap((parcel) =>
    parcel.messages.map((message) => message.internalDate.slice(0, 10)),
  );

  if (messageDates.length > 0) {
    return messageDates.reduce((min, date) => (date < min ? date : min));
  }

  return parcels
    .map((parcel) => parcel.orderDate)
    .reduce((min, date) => (date < min ? date : min));
}

export function resolveMergeFields(input: {
  parcels: ParcelDto[];
  textChoices: Partial<Record<NullableMergeField, FieldChoice>>;
  otherText: Partial<Record<NullableMergeField, string>>;
  carrierChoice: CarrierChoice | null;
  otherCarrierLabel: string;
  textConflicts: TextFieldConflict[];
  carrierConflict: CarrierConflict | null;
}): MergeParcelsFields {
  const fields: MergeParcelsFields = {
    store: unanimousTextValue(input.parcels, 'store'),
    description: unanimousTextValue(input.parcels, 'description'),
    trackingNumber: unanimousTextValue(input.parcels, 'trackingNumber'),
    trackingUrl: unanimousTextValue(input.parcels, 'trackingUrl'),
    ...unanimousCarrier(input.parcels),
  };

  for (const conflict of input.textConflicts) {
    const choice = input.textChoices[conflict.field];
    if (choice?.kind === 'value') {
      fields[conflict.field] = choice.value;
    } else if (choice?.kind === 'empty') {
      fields[conflict.field] = null;
    } else if (choice?.kind === 'other') {
      const other = input.otherText[conflict.field]?.trim() ?? '';
      fields[conflict.field] = other.length > 0 ? other : null;
    }
  }

  if (input.carrierConflict) {
    if (input.carrierChoice?.kind === 'value') {
      fields.carrier = input.carrierChoice.carrier;
      fields.customCarrierLabel =
        input.carrierChoice.carrier === 'CUSTOM'
          ? input.carrierChoice.customCarrierLabel
          : null;
    } else if (input.carrierChoice?.kind === 'other') {
      fields.carrier = 'CUSTOM';
      fields.customCarrierLabel = input.otherCarrierLabel.trim() || null;
    }
  }

  return fields;
}

export function isMergeFormComplete(input: {
  textConflicts: TextFieldConflict[];
  textChoices: Partial<Record<NullableMergeField, FieldChoice>>;
  otherText: Partial<Record<NullableMergeField, string>>;
  carrierConflict: CarrierConflict | null;
  carrierChoice: CarrierChoice | null;
  otherCarrierLabel: string;
}): boolean {
  for (const conflict of input.textConflicts) {
    const choice = input.textChoices[conflict.field];
    if (!choice) {
      return false;
    }
    if (choice.kind === 'other') {
      const other = input.otherText[conflict.field]?.trim() ?? '';
      if (other.length === 0) {
        return false;
      }
    }
  }

  if (input.carrierConflict) {
    if (!input.carrierChoice) {
      return false;
    }
    if (input.carrierChoice.kind === 'other') {
      if (input.otherCarrierLabel.trim().length === 0) {
        return false;
      }
    }
  }

  return true;
}

export const MERGE_FIELD_LABELS: Record<NullableMergeField | 'carrier', string> =
  {
    store: 'Store',
    description: 'Description',
    trackingNumber: 'Tracking number',
    trackingUrl: 'Tracking URL',
    carrier: 'Carrier',
  };
