import { Injectable } from '@nestjs/common';
import { ParcelSource, ParcelStatus, type Parcel } from '@prisma/client';
import { detectStoreFromSender } from '../extraction/detect-store-from-sender';
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
        await this.processMessage(userId, jobId, messageId);
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

    if (detectStoreFromSender(message.from) === null) {
      await this.createLedgerEntry(userId, gmailMessageId, internalDate);
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

    await this.createLedgerEntry(userId, gmailMessageId, internalDate);

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
    const fieldData = {
      store: extraction.store,
      description: extraction.description,
      carrier: extraction.carrier,
      customCarrierLabel: extraction.customCarrierLabel,
    };

    let parcelId: string;
    let imported = false;

    if (!existing) {
      const created = await this.prisma.parcel.create({
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
      await this.prisma.parcel.update({
        where: { id: existing.id },
        data: fieldData,
      });
      parcelId = existing.id;
    } else {
      const changed = parcelFieldsChanged(existing, fieldData);
      await this.prisma.parcel.update({
        where: { id: existing.id },
        data: fieldData,
      });
      parcelId = existing.id;
      imported = changed;
    }

    await this.prisma.parcelEmail.create({
      data: {
        parcelId,
        gmailMessageId,
        userId,
      },
    });

    await this.recomputeOrderDate(parcelId);
    return imported;
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

  private async recomputeOrderDate(parcelId: string): Promise<void> {
    const links = await this.prisma.parcelEmail.findMany({
      where: { parcelId },
      include: { gmailMessage: { select: { internalDate: true } } },
    });

    if (links.length === 0) {
      return;
    }

    const minTimestamp = Math.min(
      ...links.map((link) => link.gmailMessage.internalDate.getTime()),
    );

    await this.prisma.parcel.update({
      where: { id: parcelId },
      data: { orderDate: new Date(minTimestamp) },
    });
  }
}

type ParcelFieldData = Pick<
  Parcel,
  'store' | 'description' | 'carrier' | 'customCarrierLabel'
>;

function parcelFieldsChanged(existing: Parcel, next: ParcelFieldData): boolean {
  return (
    existing.store !== next.store ||
    existing.description !== next.description ||
    existing.carrier !== next.carrier ||
    existing.customCarrierLabel !== next.customCarrierLabel
  );
}
