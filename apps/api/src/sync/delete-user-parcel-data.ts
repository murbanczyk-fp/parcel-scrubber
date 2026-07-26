import type { PrismaService } from '../prisma/prisma.service';

export type DeleteUserParcelDataResponse = {
  deletedParcelEmails: number;
  deletedStatusEvents: number;
  deletedParcels: number;
  deletedGmailMessages: number;
};

export async function deleteUserParcelData(
  prisma: PrismaService,
  userId: string,
): Promise<DeleteUserParcelDataResponse> {
  const [
    deletedParcelEmails,
    deletedStatusEvents,
    deletedParcels,
    deletedGmailMessages,
  ] = await prisma.$transaction([
    prisma.parcelEmail.deleteMany({ where: { userId } }),
    prisma.parcelStatusEvent.deleteMany({
      where: { parcel: { userId } },
    }),
    prisma.parcel.deleteMany({ where: { userId } }),
    prisma.gmailMessage.deleteMany({ where: { userId } }),
  ]);

  return {
    deletedParcelEmails: deletedParcelEmails.count,
    deletedStatusEvents: deletedStatusEvents.count,
    deletedParcels: deletedParcels.count,
    deletedGmailMessages: deletedGmailMessages.count,
  };
}
