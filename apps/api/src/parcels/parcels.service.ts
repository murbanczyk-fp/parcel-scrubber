import { Injectable, NotFoundException } from '@nestjs/common';
import { ParcelStatus, StatusEventSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ARCHIVED_PARCEL_STATUSES } from './is-archived-status';
import { mapParcelToDto } from './map-parcel-to-dto';
import type { ParcelDto } from './parcel.dto';

type ListForUserOptions = {
  status: 'active' | 'archived';
};

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
    });

    return parcels.map(mapParcelToDto);
  }

  markDelivered(userId: string, parcelId: string): Promise<ParcelDto> {
    return this.transitionStatus(userId, parcelId, ParcelStatus.DELIVERED);
  }

  markRemoved(userId: string, parcelId: string): Promise<ParcelDto> {
    return this.transitionStatus(userId, parcelId, ParcelStatus.REMOVED);
  }

  private async transitionStatus(
    userId: string,
    parcelId: string,
    targetStatus: ParcelStatus,
  ): Promise<ParcelDto> {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, userId },
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
      });
    });

    return mapParcelToDto(updated);
  }
}
