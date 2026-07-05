import {
  BadRequestException,
  INestApplication,
  NotFoundException,
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

const sampleParcel = {
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
};

function attachSessionUser(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest<{ user: SessionUser }>();
  req.user = sessionUser;
  return true;
}

const authGuard = { canActivate: attachSessionUser };

describe('ParcelsController', () => {
  let controller: ParcelsController;
  let parcelsService: {
    listForUser: jest.Mock;
    markDelivered: jest.Mock;
    markRemoved: jest.Mock;
  };

  beforeEach(async () => {
    parcelsService = {
      listForUser: jest.fn().mockResolvedValue([]),
      markDelivered: jest.fn().mockResolvedValue(sampleParcel),
      markRemoved: jest.fn().mockResolvedValue({
        ...sampleParcel,
        status: 'REMOVED',
      }),
    };

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

  it('returns archived parcels for authenticated user', async () => {
    const parcels = [{ id: 'parcel-1', status: 'DELIVERED' }];
    parcelsService.listForUser.mockResolvedValue(parcels);

    await expect(
      controller.listParcels(sessionUser, 'archived'),
    ).resolves.toEqual(parcels);
    expect(parcelsService.listForUser).toHaveBeenCalledWith(sessionUser.id, {
      status: 'archived',
    });
  });

  it('rejects unknown status query values', () => {
    expect(() => controller.listParcels(sessionUser, 'pending')).toThrow(
      BadRequestException,
    );
    expect(() => controller.listParcels(sessionUser, undefined)).toThrow(
      BadRequestException,
    );
  });

  it('delegates deliver and remove to the service', async () => {
    await expect(
      controller.deliverParcel(sessionUser, 'parcel-1'),
    ).resolves.toEqual(sampleParcel);
    expect(parcelsService.markDelivered).toHaveBeenCalledWith(
      sessionUser.id,
      'parcel-1',
    );

    await expect(
      controller.removeParcel(sessionUser, 'parcel-1'),
    ).resolves.toEqual({
      ...sampleParcel,
      status: 'REMOVED',
    });
    expect(parcelsService.markRemoved).toHaveBeenCalledWith(
      sessionUser.id,
      'parcel-1',
    );
  });

  describe('HTTP', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    async function createApp(): Promise<INestApplication> {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ParcelsController],
        providers: [{ provide: ParcelsService, useValue: parcelsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(authGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();
      return app;
    }

    it('GET /parcels?status=active returns parcel list', async () => {
      parcelsService.listForUser.mockResolvedValue([sampleParcel]);
      await createApp();

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

    it('GET /parcels?status=archived returns archived parcel list', async () => {
      parcelsService.listForUser.mockResolvedValue([
        { ...sampleParcel, status: 'DELIVERED' },
      ]);
      await createApp();

      const server = app.getHttpServer() as Server;

      await request(server).get('/parcels?status=archived').expect(200);

      expect(parcelsService.listForUser).toHaveBeenCalledWith(sessionUser.id, {
        status: 'archived',
      });
    });

    it('GET /parcels without status returns 400', async () => {
      await createApp();

      const server = app.getHttpServer() as Server;

      await request(server).get('/parcels').expect(400);
    });

    it('POST /parcels/:id/deliver returns 200 with parcel body', async () => {
      parcelsService.markDelivered.mockResolvedValue({
        ...sampleParcel,
        status: 'DELIVERED',
      });
      await createApp();

      const server = app.getHttpServer() as Server;

      const response = await request(server)
        .post('/parcels/parcel-1/deliver')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'parcel-1',
        status: 'DELIVERED',
      });
    });

    it('POST /parcels/:id/remove returns 200 with parcel body', async () => {
      parcelsService.markRemoved.mockResolvedValue({
        ...sampleParcel,
        status: 'REMOVED',
      });
      await createApp();

      const server = app.getHttpServer() as Server;

      const response = await request(server)
        .post('/parcels/parcel-1/remove')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'parcel-1',
        status: 'REMOVED',
      });
    });

    it('POST /parcels/:id/deliver returns 404 when parcel is not found', async () => {
      parcelsService.markDelivered.mockRejectedValue(
        new NotFoundException('Parcel not found'),
      );
      await createApp();

      const server = app.getHttpServer() as Server;

      await request(server).post('/parcels/missing/deliver').expect(404);
    });

    it('POST /parcels/:id/remove returns 404 when parcel is not found', async () => {
      parcelsService.markRemoved.mockRejectedValue(
        new NotFoundException('Parcel not found'),
      );
      await createApp();

      const server = app.getHttpServer() as Server;

      await request(server).post('/parcels/missing/remove').expect(404);
    });
  });
});
