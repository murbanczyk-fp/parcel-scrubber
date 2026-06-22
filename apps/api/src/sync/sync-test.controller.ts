import { Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';

export type ResetSyncResponse = {
  deletedParcelEmails: number;
  deletedStatusEvents: number;
  deletedParcels: number;
  deletedGmailMessages: number;
};

@Controller('test')
@UseGuards(JwtAuthGuard)
export class SyncTestController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('reset-sync')
  async resetSync(
    @CurrentUser() user: SessionUser,
  ): Promise<ResetSyncResponse> {
    const [
      deletedParcelEmails,
      deletedStatusEvents,
      deletedParcels,
      deletedGmailMessages,
    ] = await this.prisma.$transaction([
      this.prisma.parcelEmail.deleteMany({ where: { userId: user.id } }),
      this.prisma.parcelStatusEvent.deleteMany({
        where: { parcel: { userId: user.id } },
      }),
      this.prisma.parcel.deleteMany({ where: { userId: user.id } }),
      this.prisma.gmailMessage.deleteMany({ where: { userId: user.id } }),
    ]);

    return {
      deletedParcelEmails: deletedParcelEmails.count,
      deletedStatusEvents: deletedStatusEvents.count,
      deletedParcels: deletedParcels.count,
      deletedGmailMessages: deletedGmailMessages.count,
    };
  }
}
