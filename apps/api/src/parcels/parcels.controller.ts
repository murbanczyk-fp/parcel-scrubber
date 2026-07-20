import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import type {
  CreateParcelBody,
  MergeParcelsBody,
  ParcelDto,
  UpdateParcelBody,
} from './parcel.dto';
import { ParcelValidationError } from './parcel-validation.error';
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

  @Post()
  createParcel(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateParcelBody,
  ): Promise<ParcelDto> {
    return this.handleValidation(() =>
      this.parcels.createForUser(user.id, body),
    );
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  mergeParcels(
    @CurrentUser() user: SessionUser,
    @Body() body: MergeParcelsBody,
  ): Promise<ParcelDto> {
    return this.handleValidation(() =>
      this.parcels.mergeForUser(user.id, body),
    );
  }

  @Get(':id')
  getParcel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ParcelDto> {
    return this.parcels.getByIdForUser(user.id, id);
  }

  @Patch(':id')
  updateParcel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: UpdateParcelBody,
  ): Promise<ParcelDto> {
    return this.handleValidation(() =>
      this.parcels.updateForUser(user.id, id, body),
    );
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

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivateParcel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ParcelDto> {
    return this.parcels.reactivateParcel(user.id, id);
  }

  private async handleValidation(
    fn: () => Promise<ParcelDto>,
  ): Promise<ParcelDto> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ParcelValidationError) {
        throw new BadRequestException({ errors: err.errors });
      }

      throw err;
    }
  }
}
