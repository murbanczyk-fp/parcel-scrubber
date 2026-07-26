import type { PrismaService } from '../prisma/prisma.service';
import { deleteUserParcelData } from './delete-user-parcel-data';

describe('deleteUserParcelData', () => {
  it('deletes the user parcel boundary in one transaction and maps counts', async () => {
    const userId = 'user-1';
    const parcelEmailDelete = Promise.resolve({ count: 2 });
    const statusEventDelete = Promise.resolve({ count: 3 });
    const parcelDelete = Promise.resolve({ count: 4 });
    const gmailMessageDelete = Promise.resolve({ count: 5 });
    const transaction = jest
      .fn()
      .mockImplementation((operations: Promise<{ count: number }>[]) =>
        Promise.all(operations),
      );
    const prismaMock = {
      parcelEmail: {
        deleteMany: jest.fn().mockReturnValue(parcelEmailDelete),
      },
      parcelStatusEvent: {
        deleteMany: jest.fn().mockReturnValue(statusEventDelete),
      },
      parcel: {
        deleteMany: jest.fn().mockReturnValue(parcelDelete),
      },
      gmailMessage: {
        deleteMany: jest.fn().mockReturnValue(gmailMessageDelete),
      },
      $transaction: transaction,
    };

    await expect(
      deleteUserParcelData(prismaMock as unknown as PrismaService, userId),
    ).resolves.toEqual({
      deletedParcelEmails: 2,
      deletedStatusEvents: 3,
      deletedParcels: 4,
      deletedGmailMessages: 5,
    });

    expect(prismaMock.parcelEmail.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(prismaMock.parcelStatusEvent.deleteMany).toHaveBeenCalledWith({
      where: { parcel: { userId } },
    });
    expect(prismaMock.parcel.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(prismaMock.gmailMessage.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith([
      parcelEmailDelete,
      statusEventDelete,
      parcelDelete,
      gmailMessageDelete,
    ]);
  });
});
