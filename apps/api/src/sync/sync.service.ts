import { Injectable } from '@nestjs/common';
import { ParcelSource, ParcelStatus, type Parcel } from '@prisma/client';
import { ExtractionService } from '../extraction/extraction.service';
import { ExtractionError } from '../extraction/types';
import type { ExtractedParcelFields } from '../extraction/types';
import { GmailService } from '../gmail/gmail.service';
import { parseGmailDateHeader } from '../gmail/parse-gmail-date-header';
import { GmailAuthError } from '../gmail/types';
import { isArchivedStatus } from '../parcels/is-archived-status';
import { normalizeTrackingNumber } from '../parcels/normalize-tracking-number';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  mergeParcelFieldsFromExtraction,
  parcelFieldsChanged,
} from './merge-parcel-fields-from-extraction';
import { SyncJobRegistry } from './sync-job.registry';

@Injectable()
export class SyncService {
  constructor(
    private readonly registry: SyncJobRegistry,
    private readonly settings: SettingsService,
    private readonly gmail: GmailService,
    private readonly extraction: ExtractionService,
    private readonly prisma: PrismaService,
  ) {}

  async runJob(userId: string, jobId: string): Promise<void> {
    try {
      const effective = await this.settings.getEffectiveSettings(userId);
      const allIds = await this.gmail.listMatchingEmailIds(
        userId,
        effective.gmailScanLabel,
        effective.scanPeriodDays,
      );

      const ledgerRows = await this.prisma.gmailMessage.findMany({
        where: { userId },
        select: { gmailMessageId: true },
      });
      const ledgerSet = new Set(ledgerRows.map((row) => row.gmailMessageId));
      const workIds = allIds.filter((id) => !ledgerSet.has(id));

      this.registry.update(jobId, {
        phase: 'processing',
        total: workIds.length,
      });

      for (const messageId of workIds) {
        try {
          await this.processMessage(userId, jobId, messageId);
        } catch (error) {
          if (error instanceof GmailAuthError) {
            throw error;
          }

          this.registry.increment(jobId, 'failed');
        }

        this.registry.increment(jobId, 'processed');
      }

      this.registry.update(jobId, {
        status: 'completed',
        phase: 'done',
        finishedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof GmailAuthError) {
        this.registry.update(jobId, {
          status: 'failed',
          phase: 'done',
          error: error.message,
          errorCode: 'GMAIL_AUTH_REQUIRED',
          finishedAt: new Date(),
        });
      } else {
        this.registry.update(jobId, {
          status: 'failed',
          phase: 'done',
          error: error instanceof Error ? error.message : 'Sync failed',
          finishedAt: new Date(),
        });
      }
    } finally {
      this.registry.finishRunning(userId);
    }
  }

  private async processMessage(
    userId: string,
    jobId: string,
    gmailMessageId: string,
  ): Promise<void> {
    const message = await this.gmail.getMessage(userId, gmailMessageId);
    const internalDate = parseGmailDateHeader(message.date);

    if (!internalDate) {
      await this.createLedgerEntry(userId, gmailMessageId, new Date());
      this.registry.increment(jobId, 'skipped');
      return;
    }

    let extraction: ExtractedParcelFields;
    try {
      extraction = await this.extraction.extractParcelFields(message);
    } catch (error) {
      if (error instanceof ExtractionError) {
        await this.createLedgerEntry(userId, gmailMessageId, internalDate);
        this.registry.increment(jobId, 'failed');
        return;
      }

      throw error;
    }

    const normalizedTracking = normalizeTrackingNumber(
      extraction.trackingNumber,
    );
    if (!normalizedTracking) {
      await this.createLedgerEntry(userId, gmailMessageId, internalDate);
      this.registry.increment(jobId, 'skipped');
      return;
    }

    const existing = await this.prisma.parcel.findFirst({
      where: { userId, trackingNumber: normalizedTracking },
    });

    const imported = await this.upsertParcelFromExtraction(
      userId,
      gmailMessageId,
      internalDate,
      normalizedTracking,
      extraction,
      existing,
    );

    if (imported) {
      this.registry.increment(jobId, 'imported');
    }
  }

  private async upsertParcelFromExtraction(
    userId: string,
    gmailMessageId: string,
    internalDate: Date,
    trackingNumber: string,
    extraction: ExtractedParcelFields,
    existing: Parcel | null,
  ): Promise<boolean> {
    const fieldData = mergeParcelFieldsFromExtraction(existing, extraction);

    return this.prisma.$transaction(async (tx) => {
      let parcelId: string;
      let imported = false;

      if (!existing) {
        const created = await tx.parcel.create({
          data: {
            userId,
            trackingNumber,
            orderDate: internalDate,
            status: ParcelStatus.NEW,
            source: ParcelSource.GMAIL,
            ...fieldData,
          },
        });
        parcelId = created.id;
        imported = true;
      } else if (isArchivedStatus(existing.status)) {
        await tx.parcel.update({
          where: { id: existing.id },
          data: fieldData,
        });
        parcelId = existing.id;
      } else {
        const changed = parcelFieldsChanged(existing, fieldData);
        await tx.parcel.update({
          where: { id: existing.id },
          data: fieldData,
        });
        parcelId = existing.id;
        imported = changed;
      }

      await tx.gmailMessage.create({
        data: {
          userId,
          gmailMessageId,
          internalDate,
        },
      });

      await tx.parcelEmail.create({
        data: {
          parcelId,
          gmailMessageId,
          userId,
        },
      });

      const links = await tx.parcelEmail.findMany({
        where: { parcelId },
        include: { gmailMessage: { select: { internalDate: true } } },
      });

      if (links.length > 0) {
        const minTimestamp = Math.min(
          ...links.map((link) => link.gmailMessage.internalDate.getTime()),
        );

        await tx.parcel.update({
          where: { id: parcelId },
          data: { orderDate: new Date(minTimestamp) },
        });
      }

      return imported;
    });
  }

  private async createLedgerEntry(
    userId: string,
    gmailMessageId: string,
    internalDate: Date,
  ): Promise<void> {
    await this.prisma.gmailMessage.create({
      data: {
        userId,
        gmailMessageId,
        internalDate,
      },
    });
  }
}
