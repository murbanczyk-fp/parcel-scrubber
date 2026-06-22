import { Test, TestingModule } from '@nestjs/testing';

import type { SessionUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { SyncTestController } from './sync-test.controller';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

describe('SyncTestController', () => {
  let controller: SyncTestController;
  let prisma: {
    $transaction: jest.Mock;
    parcelEmail: { deleteMany: jest.Mock };
    parcelStatusEvent: { deleteMany: jest.Mock };
    parcel: { deleteMany: jest.Mock };
    gmailMessage: { deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      parcelEmail: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      parcelStatusEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      parcel: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      gmailMessage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (ops: Promise<{ count: number }>[]) => Promise.all(ops),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncTestController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(SyncTestController);
  });

  it('deletes all sync data for the authenticated user', async () => {
    await expect(controller.resetSync(sessionUser)).resolves.toEqual({
      deletedParcelEmails: 2,
      deletedStatusEvents: 1,
      deletedParcels: 3,
      deletedGmailMessages: 5,
    });

    expect(prisma.parcelEmail.deleteMany).toHaveBeenCalledWith({
      where: { userId: sessionUser.id },
    });
    expect(prisma.parcelStatusEvent.deleteMany).toHaveBeenCalledWith({
      where: { parcel: { userId: sessionUser.id } },
    });
    expect(prisma.parcel.deleteMany).toHaveBeenCalledWith({
      where: { userId: sessionUser.id },
    });
    expect(prisma.gmailMessage.deleteMany).toHaveBeenCalledWith({
      where: { userId: sessionUser.id },
    });
  });
});
