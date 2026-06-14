import {
  BadGatewayException,
  BadRequestException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { Carrier } from '@prisma/client';
import type { Server } from 'http';
import request from 'supertest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { GmailService } from '../gmail/gmail.service';
import { GmailAuthError } from '../gmail/types';
import { ExtractionTestController } from './extraction-test.controller';
import { ExtractionService } from './extraction.service';
import { ExtractionError } from './types';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

describe('ExtractionTestController', () => {
  let controller: ExtractionTestController;
  let gmailService: {
    getMessage: jest.Mock;
  };
  let extractionService: {
    extractParcelFields: jest.Mock;
  };

  const gmailMessage = {
    from: 'Allegro <powiadomienia@allegro.pl>',
    date: 'Mon, 9 Jun 2026 10:00:00 +0000',
    subject: 'Twoja przesyłka została nadana',
    body: 'Numer przesyłki: 520000012680041086770098',
  };

  const extractedFields = {
    store: 'Allegro' as const,
    trackingNumber: '520000012680041086770098',
    carrier: Carrier.INPOST,
    customCarrierLabel: null,
    description: null,
  };

  beforeEach(async () => {
    gmailService = {
      getMessage: jest.fn(),
    };
    extractionService = {
      extractParcelFields: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExtractionTestController],
      providers: [
        { provide: GmailService, useValue: gmailService },
        { provide: ExtractionService, useValue: extractionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ExtractionTestController);
  });

  it('applies JwtAuthGuard at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ExtractionTestController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  it('requires id query parameter', async () => {
    await expect(controller.extract(sessionUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('chains Gmail fetch and extraction in order', async () => {
    gmailService.getMessage.mockResolvedValue(gmailMessage);
    extractionService.extractParcelFields.mockResolvedValue(extractedFields);

    await expect(controller.extract(sessionUser, 'msg-1')).resolves.toEqual({
      message: gmailMessage,
      result: extractedFields,
    });

    expect(gmailService.getMessage).toHaveBeenCalledWith(
      sessionUser.id,
      'msg-1',
    );
    expect(extractionService.extractParcelFields).toHaveBeenCalledWith(
      gmailMessage,
    );
    expect(gmailService.getMessage.mock.invocationCallOrder[0]).toBeLessThan(
      extractionService.extractParcelFields.mock.invocationCallOrder[0],
    );
  });

  it('maps GmailAuthError to UnauthorizedException', async () => {
    gmailService.getMessage.mockRejectedValue(
      new GmailAuthError('re-auth required'),
    );

    await expect(
      controller.extract(sessionUser, 'msg-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(extractionService.extractParcelFields).not.toHaveBeenCalled();
  });

  it('maps ExtractionError to BadGatewayException', async () => {
    gmailService.getMessage.mockResolvedValue(gmailMessage);
    extractionService.extractParcelFields.mockRejectedValue(
      new ExtractionError('OpenRouter request failed'),
    );

    await expect(
      controller.extract(sessionUser, 'msg-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  describe('authorization', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('returns 401 when JwtAuthGuard rejects the request', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ExtractionTestController],
        providers: [
          { provide: GmailService, useValue: gmailService },
          { provide: ExtractionService, useValue: extractionService },
        ],
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

      await request(server).get('/test/extract?id=msg-1').expect(401);
    });
  });
});
