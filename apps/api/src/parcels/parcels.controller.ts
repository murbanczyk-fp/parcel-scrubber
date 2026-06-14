import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import type { ParcelDto } from './parcel.dto';
import { ParcelsService } from './parcels.service';

@Controller('parcels')
@UseGuards(JwtAuthGuard)
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Get()
  listParcels(
    @CurrentUser() user: SessionUser,
    @Query('status') status?: string,
  ): Promise<ParcelDto[]> {
    if (status !== 'active') {
      throw new BadRequestException(
        'Query parameter "status" must be "active"',
      );
    }

    return this.parcels.listForUser(user.id, { status: 'active' });
  }
}
