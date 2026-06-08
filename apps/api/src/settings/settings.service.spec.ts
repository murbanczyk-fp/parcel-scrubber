import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { USER_SETTING_KEYS } from '../user-settings';
import { SettingsValidationError } from './settings-validation.error';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let findMany: jest.Mock;
  let upsert: jest.Mock;

  const userId = 'user-1';

  beforeEach(async () => {
    findMany = jest.fn();
    upsert = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: {
            userSetting: { findMany, upsert },
          },
        },
      ],
    }).compile();

    service = module.get(SettingsService);
  });

  describe('getEffectiveSettings', () => {
    it('returns PRD defaults when user has no settings rows', async () => {
      findMany.mockResolvedValue([]);

      await expect(service.getEffectiveSettings(userId)).resolves.toEqual({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { settingKey: true, settingValue: true },
      });
    });
  });

  describe('updateSettings', () => {
    it('upserts only the changed key on partial patch', async () => {
      findMany.mockResolvedValue([
        {
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'MyLabel',
        },
      ]);

      upsert.mockResolvedValue({});

      await expect(
        service.updateSettings(userId, { gmailScanLabel: 'MyLabel' }),
      ).resolves.toEqual({
        gmailScanLabel: 'MyLabel',
        scanPeriodDays: 30,
      });

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith({
        where: {
          userId_settingKey: {
            userId,
            settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          },
        },
        create: {
          userId,
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'MyLabel',
        },
        update: { settingValue: 'MyLabel' },
      });
    });

    it('rejects an empty patch body', async () => {
      await expect(service.updateSettings(userId, {})).rejects.toBeInstanceOf(
        SettingsValidationError,
      );

      await expect(service.updateSettings(userId, {})).rejects.toMatchObject({
        errors: [{ message: 'Request body must include at least one setting' }],
      });

      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects unknown patch keys', async () => {
      await expect(
        service.updateSettings(userId, {
          unknownKey: 'value',
        } as Partial<{
          gmailScanLabel: string;
          scanPeriodDays: number;
        }>),
      ).rejects.toMatchObject({
        errors: [{ message: 'Unknown setting key(s): unknownKey' }],
      });

      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects an invalid gmail scan label', async () => {
      await expect(
        service.updateSettings(userId, { gmailScanLabel: '' }),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'gmailScanLabel',
            message: 'Gmail scan label must not be empty',
          },
        ],
      });

      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects an invalid scan period', async () => {
      await expect(
        service.updateSettings(userId, { scanPeriodDays: 400 }),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'scanPeriodDays',
            message: 'Scan period days must be between 1 and 365',
          },
        ],
      });

      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric scan period', async () => {
      await expect(
        service.updateSettings(userId, {
          scanPeriodDays: Number.NaN,
        }),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'scanPeriodDays',
            message: 'Scan period days must be a number',
          },
        ],
      });

      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
