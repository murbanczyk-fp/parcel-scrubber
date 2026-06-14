import { Injectable } from '@nestjs/common';
import { ParcelStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { mapParcelToDto } from './map-parcel-to-dto';
import type { ParcelDto } from './parcel.dto';

type ListForUserOptions = {
  status: 'active';
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
            : undefined,
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    });

    return parcels.map(mapParcelToDto);
  }
}
