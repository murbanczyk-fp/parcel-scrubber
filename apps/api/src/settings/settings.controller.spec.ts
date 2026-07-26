import {
  BadRequestException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { SettingsValidationError } from './settings-validation.error';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsService: {
    clearParcelData: jest.Mock;
    getEffectiveSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  beforeEach(async () => {
    settingsService = {
      clearParcelData: jest.fn(),
      getEffectiveSettings: jest.fn(),
      updateSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: settingsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SettingsController);
  });

  it('applies JwtAuthGuard to all handlers', () => {
    const clearParcelDataHandler = Object.getOwnPropertyDescriptor(
      SettingsController.prototype,
      'clearParcelData',
    )?.value as (...args: unknown[]) => unknown;
    const getSettingsHandler = Object.getOwnPropertyDescriptor(
      SettingsController.prototype,
      'getSettings',
    )?.value as (...args: unknown[]) => unknown;
    const patchSettingsHandler = Object.getOwnPropertyDescriptor(
      SettingsController.prototype,
      'patchSettings',
    )?.value as (...args: unknown[]) => unknown;

    const clearParcelDataGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      clearParcelDataHandler,
    ) as unknown[];
    const getGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      getSettingsHandler,
    ) as unknown[];
    const patchGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      patchSettingsHandler,
    ) as unknown[];

    expect(clearParcelDataGuards).toContain(JwtAuthGuard);
    expect(getGuards).toContain(JwtAuthGuard);
    expect(patchGuards).toContain(JwtAuthGuard);
  });

  describe('clearParcelData', () => {
    it('returns delete counts for the authenticated user', async () => {
      const response = {
        deletedParcelEmails: 2,
        deletedStatusEvents: 3,
        deletedParcels: 4,
        deletedGmailMessages: 5,
      };
      settingsService.clearParcelData.mockResolvedValue(response);

      await expect(controller.clearParcelData(sessionUser)).resolves.toEqual(
        response,
      );
      expect(settingsService.clearParcelData).toHaveBeenCalledWith(
        sessionUser.id,
      );
    });
  });

  describe('getSettings', () => {
    it('returns effective settings for the authenticated user', async () => {
      const effective = {
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      };
      settingsService.getEffectiveSettings.mockResolvedValue(effective);

      await expect(controller.getSettings(sessionUser)).resolves.toEqual(
        effective,
      );
      expect(settingsService.getEffectiveSettings).toHaveBeenCalledWith(
        sessionUser.id,
      );
    });
  });

  describe('patchSettings', () => {
    it('returns updated effective settings on success', async () => {
      const updated = {
        gmailScanLabel: 'MyLabel',
        scanPeriodDays: 30,
      };
      settingsService.updateSettings.mockResolvedValue(updated);

      await expect(
        controller.patchSettings(sessionUser, { gmailScanLabel: 'MyLabel' }),
      ).resolves.toEqual(updated);

      expect(settingsService.updateSettings).toHaveBeenCalledWith(
        sessionUser.id,
        { gmailScanLabel: 'MyLabel' },
      );
    });

    it('maps SettingsValidationError to BadRequestException with field errors', async () => {
      settingsService.updateSettings.mockRejectedValue(
        new SettingsValidationError([
          {
            field: 'scanPeriodDays',
            message: 'Scan period days must be between 1 and 365',
          },
        ]),
      );

      await expect(
        controller.patchSettings(sessionUser, { scanPeriodDays: 400 }),
      ).rejects.toMatchObject({
        response: {
          errors: [
            {
              field: 'scanPeriodDays',
              message: 'Scan period days must be between 1 and 365',
            },
          ],
        },
      });

      await expect(
        controller.patchSettings(sessionUser, { scanPeriodDays: 400 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('authorization', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('returns 401 when JwtAuthGuard rejects the request', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [SettingsController],
        providers: [{ provide: SettingsService, useValue: settingsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: () => {
            throw new UnauthorizedException();
          },
        })
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      await request(server).get('/settings').expect(401);

      await request(server)
        .patch('/settings')
        .send({ gmailScanLabel: 'x' })
        .expect(401);

      await request(server).post('/settings/clear-parcel-data').expect(401);
    });
  });
});
