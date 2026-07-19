import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Carrier,
  Parcel,
  ParcelSource,
  ParcelStatus,
  Prisma,
  StatusEventSource,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ARCHIVED_PARCEL_STATUSES,
  isArchivedStatus,
} from './is-archived-status';
import { isSafeHttpUrl } from './is-safe-http-url';
import { mapParcelToDto } from './map-parcel-to-dto';
import { normalizeTrackingNumber } from './normalize-tracking-number';
import {
  PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH,
  PARCEL_DESCRIPTION_MAX_LENGTH,
  PARCEL_STORE_MAX_LENGTH,
} from './parcel-field-limits';
import type {
  CreateParcelBody,
  ParcelDto,
  UpdateParcelBody,
} from './parcel.dto';
import {
  ParcelFieldError,
  ParcelValidationError,
} from './parcel-validation.error';

type ListForUserOptions = {
  status: 'active' | 'archived';
};

const DUPLICATE_TRACKING_MESSAGE =
  'A parcel with this tracking number already exists';

const CARRIER_VALUES = new Set<string>(Object.values(Carrier));

const PARCEL_MESSAGES_INCLUDE = {
  messages: {
    include: {
      gmailMessage: {
        select: {
          gmailMessageId: true,
          internalDate: true,
          subject: true,
          from: true,
        },
      },
    },
  },
} as const;

function isCarrier(value: unknown): value is Carrier {
  return typeof value === 'string' && CARRIER_VALUES.has(value);
}

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    userId: string,
    options: ListForUserOptions,
  ): Promise<ParcelDto[]> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        userId,
        status:
          options.status === 'active'
            ? { notIn: [...ARCHIVED_PARCEL_STATUSES] }
            : { in: [...ARCHIVED_PARCEL_STATUSES] },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      include: PARCEL_MESSAGES_INCLUDE,
    });

    return parcels.map(mapParcelToDto);
  }

  async createForUser(
    userId: string,
    body: CreateParcelBody,
  ): Promise<ParcelDto> {
    const validated = this.validateCreateBody(body);

    const duplicate = await this.prisma.parcel.findFirst({
      where: { userId, trackingNumber: validated.trackingNumber },
    });

    if (duplicate) {
      throw new ParcelValidationError([
        { field: 'trackingNumber', message: DUPLICATE_TRACKING_MESSAGE },
      ]);
    }

    try {
      const created = await this.prisma.parcel.create({
        data: {
          userId,
          source: ParcelSource.MANUAL,
          status: ParcelStatus.NEW,
          store: validated.store,
          description: validated.description,
          carrier: validated.carrier,
          customCarrierLabel: validated.customCarrierLabel,
          trackingNumber: validated.trackingNumber,
          trackingUrl: validated.trackingUrl,
          orderDate: validated.orderDate,
        },
      });

      return mapParcelToDto(created);
    } catch (err) {
      this.rethrowDuplicateTrackingError(err);
    }
  }

  async getByIdForUser(userId: string, parcelId: string): Promise<ParcelDto> {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, userId },
      include: PARCEL_MESSAGES_INCLUDE,
    });

    if (!parcel) {
      throw new NotFoundException('Parcel not found');
    }

    return mapParcelToDto(parcel);
  }

  async updateForUser(
    userId: string,
    parcelId: string,
    body: UpdateParcelBody,
  ): Promise<ParcelDto> {
    const keys = Object.keys(body);

    if (keys.length === 0) {
      throw new ParcelValidationError([
        { message: 'Request body must include at least one field' },
      ]);
    }

    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, userId },
    });

    if (!parcel) {
      throw new NotFoundException('Parcel not found');
    }

    const { data, normalizedTrackingNumber } = this.validateUpdateBody(
      body,
      parcel,
    );

    if (normalizedTrackingNumber !== undefined) {
      const duplicate = await this.prisma.parcel.findFirst({
        where: {
          userId,
          trackingNumber: normalizedTrackingNumber,
          NOT: { id: parcelId },
        },
      });

      if (duplicate) {
        throw new ParcelValidationError([
          { field: 'trackingNumber', message: DUPLICATE_TRACKING_MESSAGE },
        ]);
      }
    }

    try {
      const { count } = await this.prisma.parcel.updateMany({
        where: { id: parcelId, userId },
        data,
      });

      if (count === 0) {
        throw new NotFoundException('Parcel not found');
      }

      const updated = await this.prisma.parcel.findFirst({
        where: { id: parcelId, userId },
        include: PARCEL_MESSAGES_INCLUDE,
      });

      if (!updated) {
        throw new NotFoundException('Parcel not found');
      }

      return mapParcelToDto(updated);
    } catch (err) {
      this.rethrowDuplicateTrackingError(err);
    }
  }

  markDelivered(userId: string, parcelId: string): Promise<ParcelDto> {
    return this.transitionStatus(userId, parcelId, ParcelStatus.DELIVERED);
  }

  markRemoved(userId: string, parcelId: string): Promise<ParcelDto> {
    return this.transitionStatus(userId, parcelId, ParcelStatus.REMOVED);
  }

  async reactivateParcel(userId: string, parcelId: string): Promise<ParcelDto> {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, userId },
    });

    if (!parcel) {
      throw new NotFoundException('Parcel not found');
    }

    if (
      !isArchivedStatus(parcel.status) &&
      parcel.status !== ParcelStatus.NEW
    ) {
      throw new BadRequestException('Parcel is not archived');
    }

    return this.transitionStatus(userId, parcelId, ParcelStatus.NEW);
  }

  private validateCreateBody(body: CreateParcelBody): {
    store: string;
    description: string | null;
    carrier: Carrier;
    customCarrierLabel: string | null;
    trackingNumber: string;
    trackingUrl: string | null;
    orderDate: Date;
  } {
    const errors: ParcelFieldError[] = [];

    const store = this.validateStore(body.store, errors);
    const carrier = this.validateCarrier(body.carrier, errors);
    const trackingNumber = this.validateTrackingNumber(
      body.trackingNumber,
      errors,
    );
    const orderDate = this.validateOrderDate(body.orderDate, errors);
    const customCarrierLabel = this.validateCustomCarrierLabel(
      carrier,
      body.customCarrierLabel,
      errors,
    );
    const trackingUrl = this.validateTrackingUrlForWrite(
      body.trackingUrl,
      errors,
    );
    const description = this.normalizeOptionalText(
      body.description,
      'description',
      PARCEL_DESCRIPTION_MAX_LENGTH,
      errors,
    );

    if (errors.length > 0) {
      throw new ParcelValidationError(errors);
    }

    return {
      store: store!,
      description,
      carrier: carrier!,
      customCarrierLabel,
      trackingNumber: trackingNumber!,
      trackingUrl,
      orderDate: orderDate!,
    };
  }

  private validateUpdateBody(
    body: UpdateParcelBody,
    existing: Parcel,
  ): {
    data: Prisma.ParcelUpdateInput;
    normalizedTrackingNumber?: string;
  } {
    const errors: ParcelFieldError[] = [];
    const data: Prisma.ParcelUpdateInput = {};
    let normalizedTrackingNumber: string | undefined;

    if (body.store !== undefined) {
      const store = this.validateStore(body.store, errors);
      if (store !== undefined) {
        data.store = store;
      }
    }

    if (body.description !== undefined) {
      data.description = this.normalizeOptionalText(
        body.description,
        'description',
        PARCEL_DESCRIPTION_MAX_LENGTH,
        errors,
      );
    }

    const effectiveCarrier =
      body.carrier !== undefined
        ? this.validateCarrier(body.carrier, errors)
        : existing.carrier;

    if (body.carrier !== undefined && effectiveCarrier !== undefined) {
      data.carrier = effectiveCarrier;
    }

    const labelSource =
      body.customCarrierLabel !== undefined
        ? body.customCarrierLabel
        : existing.customCarrierLabel;

    const customCarrierLabel = this.validateCustomCarrierLabel(
      effectiveCarrier ?? existing.carrier,
      labelSource,
      errors,
      body.customCarrierLabel !== undefined ? 'customCarrierLabel' : undefined,
    );

    if (body.customCarrierLabel !== undefined) {
      data.customCarrierLabel = customCarrierLabel;
    } else if (
      body.carrier === Carrier.CUSTOM &&
      existing.carrier !== Carrier.CUSTOM
    ) {
      data.customCarrierLabel = customCarrierLabel;
    } else if (
      body.carrier !== undefined &&
      effectiveCarrier !== undefined &&
      effectiveCarrier !== Carrier.CUSTOM
    ) {
      data.customCarrierLabel = null;
    }

    if (body.trackingNumber !== undefined) {
      const trackingNumber = this.validateTrackingNumber(
        body.trackingNumber,
        errors,
      );
      if (trackingNumber !== undefined) {
        data.trackingNumber = trackingNumber;
        normalizedTrackingNumber = trackingNumber;
      }
    }

    if (body.trackingUrl !== undefined) {
      data.trackingUrl = this.validateTrackingUrlForClear(
        body.trackingUrl,
        errors,
      );
    }

    if (body.orderDate !== undefined) {
      const orderDate = this.validateOrderDate(body.orderDate, errors);
      if (orderDate !== undefined) {
        data.orderDate = orderDate;
      }
    }

    if (errors.length > 0) {
      throw new ParcelValidationError(errors);
    }

    return { data, normalizedTrackingNumber };
  }

  private validateStore(
    value: unknown,
    errors: ParcelFieldError[],
  ): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push({ field: 'store', message: 'Store is required' });
      return undefined;
    }

    const trimmed = value.trim();

    if (trimmed.length > PARCEL_STORE_MAX_LENGTH) {
      errors.push({
        field: 'store',
        message: `Store must be at most ${PARCEL_STORE_MAX_LENGTH} characters`,
      });
      return undefined;
    }

    return trimmed;
  }

  private validateCarrier(
    value: unknown,
    errors: ParcelFieldError[],
  ): Carrier | undefined {
    if (!isCarrier(value)) {
      errors.push({ field: 'carrier', message: 'Carrier is required' });
      return undefined;
    }

    return value;
  }

  private validateTrackingNumber(
    value: unknown,
    errors: ParcelFieldError[],
  ): string | undefined {
    if (value == null || typeof value !== 'string') {
      errors.push({
        field: 'trackingNumber',
        message: 'Tracking number is required',
      });
      return undefined;
    }

    const normalized = normalizeTrackingNumber(value);

    if (normalized === null) {
      errors.push({
        field: 'trackingNumber',
        message: 'Tracking number is required',
      });
      return undefined;
    }

    return normalized;
  }

  private validateOrderDate(
    value: unknown,
    errors: ParcelFieldError[],
  ): Date | undefined {
    if (typeof value !== 'string') {
      errors.push({
        field: 'orderDate',
        message: 'Order date must be YYYY-MM-DD',
      });
      return undefined;
    }

    const parsed = this.parseOrderDate(value);

    if ('error' in parsed) {
      errors.push({ field: 'orderDate', message: parsed.error });
      return undefined;
    }

    return parsed.date;
  }

  private validateCustomCarrierLabel(
    carrier: Carrier | undefined,
    value: string | null | undefined,
    errors: ParcelFieldError[],
    field = 'customCarrierLabel',
  ): string | null {
    if (carrier !== Carrier.CUSTOM) {
      return null;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push({
        field,
        message: 'Custom carrier label is required when carrier is Custom',
      });
      return null;
    }

    const trimmed = value.trim();

    if (trimmed.length > PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH) {
      errors.push({
        field,
        message: `Custom carrier label must be at most ${PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH} characters`,
      });
      return null;
    }

    return trimmed;
  }

  private validateTrackingUrlForWrite(
    value: string | undefined,
    errors: ParcelFieldError[],
  ): string | null {
    if (value === undefined || value.trim().length === 0) {
      return null;
    }

    const trimmed = value.trim();

    if (!isSafeHttpUrl(trimmed)) {
      errors.push({
        field: 'trackingUrl',
        message: 'Tracking URL must be a valid http or https URL',
      });
      return null;
    }

    return trimmed;
  }

  private validateTrackingUrlForClear(
    value: string | null,
    errors: ParcelFieldError[],
  ): string | null {
    if (value === null || value.trim().length === 0) {
      return null;
    }

    const trimmed = value.trim();

    if (!isSafeHttpUrl(trimmed)) {
      errors.push({
        field: 'trackingUrl',
        message: 'Tracking URL must be a valid http or https URL',
      });
      return null;
    }

    return trimmed;
  }

  private normalizeOptionalText(
    value: string | undefined,
    field: string,
    maxLength: number,
    errors: ParcelFieldError[],
  ): string | null {
    if (value === undefined || value.trim().length === 0) {
      return null;
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
      errors.push({
        field,
        message: `Must be at most ${maxLength} characters`,
      });
      return null;
    }

    return trimmed;
  }

  private parseOrderDate(value: string): { date: Date } | { error: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { error: 'Order date must be YYYY-MM-DD' };
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      return { error: 'Order date is invalid' };
    }

    return { date };
  }

  private rethrowDuplicateTrackingError(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ParcelValidationError([
        { field: 'trackingNumber', message: DUPLICATE_TRACKING_MESSAGE },
      ]);
    }

    throw err;
  }

  private async transitionStatus(
    userId: string,
    parcelId: string,
    targetStatus: ParcelStatus,
  ): Promise<ParcelDto> {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, userId },
      include: PARCEL_MESSAGES_INCLUDE,
    });

    if (!parcel) {
      throw new NotFoundException('Parcel not found');
    }

    if (parcel.status === targetStatus) {
      return mapParcelToDto(parcel);
    }

    const fromStatus = parcel.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.parcel.updateMany({
        where: {
          id: parcelId,
          userId,
          status: fromStatus,
        },
        data: { status: targetStatus },
      });

      if (count === 0) {
        const current = await tx.parcel.findFirst({
          where: { id: parcelId, userId },
          include: PARCEL_MESSAGES_INCLUDE,
        });
        if (!current) {
          throw new NotFoundException('Parcel not found');
        }
        return current;
      }

      await tx.parcelStatusEvent.create({
        data: {
          parcelId: parcel.id,
          fromStatus,
          toStatus: targetStatus,
          source: StatusEventSource.USER,
        },
      });

      return tx.parcel.findFirstOrThrow({
        where: { id: parcelId, userId },
        include: PARCEL_MESSAGES_INCLUDE,
      });
    });

    return mapParcelToDto(updated);
  }
}
