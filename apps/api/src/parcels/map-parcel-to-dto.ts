import type { Parcel } from '@prisma/client';

import type { ParcelDto, ParcelMessageDto } from './parcel.dto';
import { resolveTrackingUrl } from './resolve-tracking-url';

export type ParcelEmailMessagePayload = {
  gmailMessage: {
    gmailMessageId: string;
    internalDate: Date;
    subject: string | null;
    from: string | null;
  };
};

export type ParcelWithMessages = Parcel & {
  messages?: ParcelEmailMessagePayload[];
};

export function mapParcelToDto(parcel: ParcelWithMessages): ParcelDto {
  return {
    id: parcel.id,
    store: parcel.store,
    description: parcel.description,
    carrier: parcel.carrier,
    customCarrierLabel: parcel.customCarrierLabel,
    trackingNumber: parcel.trackingNumber,
    trackingUrlOverride: parcel.trackingUrl,
    trackingUrl: resolveTrackingUrl(parcel),
    orderDate: parcel.orderDate.toISOString().slice(0, 10),
    status: parcel.status,
    source: parcel.source,
    createdAt: parcel.createdAt.toISOString(),
    updatedAt: parcel.updatedAt.toISOString(),
    messages: mapParcelMessages(parcel.messages),
  };
}

function mapParcelMessages(
  messages: ParcelEmailMessagePayload[] | undefined,
): ParcelMessageDto[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  return [...messages]
    .sort(
      (a, b) =>
        a.gmailMessage.internalDate.getTime() -
        b.gmailMessage.internalDate.getTime(),
    )
    .map((link) => ({
      gmailMessageId: link.gmailMessage.gmailMessageId,
      internalDate: link.gmailMessage.internalDate.toISOString(),
      subject: link.gmailMessage.subject,
      from: link.gmailMessage.from,
    }));
}
