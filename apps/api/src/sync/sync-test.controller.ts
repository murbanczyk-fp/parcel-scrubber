import { Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  deleteUserParcelData,
  type DeleteUserParcelDataResponse,
} from './delete-user-parcel-data';

@Controller('test')
@UseGuards(JwtAuthGuard)
export class SyncTestController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('reset-sync')
  async resetSync(
    @CurrentUser() user: SessionUser,
  ): Promise<DeleteUserParcelDataResponse> {
    return deleteUserParcelData(this.prisma, user.id);
  }
}
