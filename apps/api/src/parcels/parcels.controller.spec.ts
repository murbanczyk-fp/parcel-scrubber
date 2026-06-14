import {
  BadRequestException,
  INestApplication,
  type ExecutionContext,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

function attachSessionUser(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest<{ user: SessionUser }>();
  req.user = sessionUser;
  return true;
}

const authGuard = { canActivate: attachSessionUser };

describe('ParcelsController', () => {
  let controller: ParcelsController;
  let parcelsService: { listForUser: jest.Mock };

  beforeEach(async () => {
    parcelsService = { listForUser: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParcelsController],
      providers: [{ provide: ParcelsService, useValue: parcelsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ParcelsController);
  });

  it('applies JwtAuthGuard at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ParcelsController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  it('returns active parcels for authenticated user', async () => {
    const parcels = [{ id: 'parcel-1' }];
    parcelsService.listForUser.mockResolvedValue(parcels);

    await expect(
      controller.listParcels(sessionUser, 'active'),
    ).resolves.toEqual(parcels);
    expect(parcelsService.listForUser).toHaveBeenCalledWith(sessionUser.id, {
      status: 'active',
    });
  });

  it('rejects unknown status query values', () => {
    expect(() => controller.listParcels(sessionUser, 'archived')).toThrow(
      BadRequestException,
    );
    expect(() => controller.listParcels(sessionUser, undefined)).toThrow(
      BadRequestException,
    );
  });

  describe('HTTP', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('GET /parcels?status=active returns parcel list', async () => {
      parcelsService.listForUser.mockResolvedValue([
        {
          id: 'parcel-1',
          store: 'Allegro',
          description: null,
          carrier: 'INPOST',
          customCarrierLabel: null,
          trackingNumber: '520000012680041086770098',
          trackingUrl:
            'https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
          orderDate: '2026-01-15',
          status: 'NEW',
          source: 'GMAIL',
          createdAt: '2026-01-15T10:00:00.000Z',
          updatedAt: '2026-01-15T10:00:00.000Z',
        },
      ]);

      const module: TestingModule = await Test.createTestingModule({
        controllers: [ParcelsController],
        providers: [{ provide: ParcelsService, useValue: parcelsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(authGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      const response = await request(server)
        .get('/parcels?status=active')
        .expect(200);

      const body = response.body as Array<{ id: string; trackingUrl: string }>;

      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        id: 'parcel-1',
        trackingUrl: expect.stringContaining('inpost') as string,
      });
    });

    it('GET /parcels without status returns 400', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ParcelsController],
        providers: [{ provide: ParcelsService, useValue: parcelsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(authGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      await request(server).get('/parcels').expect(400);
    });
  });
});
