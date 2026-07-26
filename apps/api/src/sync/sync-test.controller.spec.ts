import { Test, TestingModule } from '@nestjs/testing';

import type { SessionUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import * as deleteUserParcelDataModule from './delete-user-parcel-data';
import { SyncTestController } from './sync-test.controller';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

describe('SyncTestController', () => {
  let controller: SyncTestController;
  const prisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncTestController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(SyncTestController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates reset for the authenticated user and returns its counts', async () => {
    const response = {
      deletedParcelEmails: 2,
      deletedStatusEvents: 1,
      deletedParcels: 3,
      deletedGmailMessages: 5,
    };
    const deleteUserParcelData = jest
      .spyOn(deleteUserParcelDataModule, 'deleteUserParcelData')
      .mockResolvedValue(response);

    await expect(controller.resetSync(sessionUser)).resolves.toEqual({
      deletedParcelEmails: 2,
      deletedStatusEvents: 1,
      deletedParcels: 3,
      deletedGmailMessages: 5,
    });

    expect(deleteUserParcelData).toHaveBeenCalledWith(prisma, sessionUser.id);
  });
});
