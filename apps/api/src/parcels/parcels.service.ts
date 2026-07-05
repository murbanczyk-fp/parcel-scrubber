import { Injectable, NotFoundException } from '@nestjs/common';
import { ParcelStatus, StatusEventSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
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
            ? { notIn: [ParcelStatus.DELIVERED, ParcelStatus.REMOVED] }
            : { in: [ParcelStatus.DELIVERED, ParcelStatus.REMOVED] },
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.parcel.update({
        where: { id: parcel.id },
        data: { status: targetStatus },
      });

      await tx.parcelStatusEvent.create({
        data: {
          parcelId: parcel.id,
          fromStatus: parcel.status,
          toStatus: targetStatus,
          source: StatusEventSource.USER,
        },
      });

      return next;
    });

    return mapParcelToDto(updated);
  }
}
