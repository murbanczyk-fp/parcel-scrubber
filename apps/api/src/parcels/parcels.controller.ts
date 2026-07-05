import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import type { ParcelDto } from './parcel.dto';
import { ParcelsService } from './parcels.service';

function parseListStatus(status: string | undefined): 'active' | 'archived' {
  if (status === 'active' || status === 'archived') {
    return status;
  }

  throw new BadRequestException(
    'Query parameter "status" must be "active" or "archived"',
  );
}

@Controller('parcels')
@UseGuards(JwtAuthGuard)
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Get()
  listParcels(
    @CurrentUser() user: SessionUser,
    @Query('status') status?: string,
  ): Promise<ParcelDto[]> {
    return this.parcels.listForUser(user.id, {
      status: parseListStatus(status),
    });
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  deliverParcel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ParcelDto> {
    return this.parcels.markDelivered(user.id, id);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  removeParcel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ParcelDto> {
    return this.parcels.markRemoved(user.id, id);
  }
}
