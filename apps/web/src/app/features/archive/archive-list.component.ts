import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';

import { ParcelsService } from '../../core/parcels/parcels.service';
import { gmailMessageUrl } from '../../core/parcels/gmail-message-url';
import { OrderDateLocalPipe } from '../../core/parcels/order-date.pipe';
import type {
  MergeParcelsPayload,
  ParcelDto,
} from '../../core/parcels/parcels.types';
import { MergeParcelsDialogComponent } from '../parcels/merge-parcels-dialog.component';

const CARRIER_LABELS: Record<ParcelDto['carrier'], string> = {
  INPOST: 'InPost',
  POCZTA_POLSKA: 'Poczta Polska',
  DPD: 'DPD',
  DHL: 'DHL',
  CUSTOM: 'Custom',
};

const STATUS_LABELS: Record<'DELIVERED' | 'REMOVED', string> = {
  DELIVERED: 'Delivered',
  REMOVED: 'Removed',
};

@Component({
  selector: 'app-archive-list',
  imports: [
    DatePipe,
    OrderDateLocalPipe,
    RouterLink,
    ButtonModule,
    CardModule,
    MessageModule,
    TableModule,
    MergeParcelsDialogComponent,
  ],
  templateUrl: './archive-list.component.html',
  styleUrl: './archive-list.component.scss',
})
export class ArchiveListComponent implements OnInit {
  private readonly parcelsService = inject(ParcelsService);
  private readonly messages = inject(MessageService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly parcels = signal<ParcelDto[]>([]);
  protected readonly actionInFlight = signal<ReadonlySet<string>>(new Set());
  protected readonly mergeDialogVisible = signal(false);
  protected readonly merging = signal(false);
  selectedParcels: ParcelDto[] = [];
  expandedRowKeys: Record<string, boolean> = {};

  ngOnInit(): void {
    void this.loadParcels();
  }

  protected carrierLabel(parcel: ParcelDto): string {
    if (parcel.carrier === 'CUSTOM') {
      return parcel.customCarrierLabel ?? CARRIER_LABELS.CUSTOM;
    }

    return CARRIER_LABELS[parcel.carrier];
  }

  protected statusLabel(parcel: ParcelDto): string {
    if (parcel.status === 'DELIVERED' || parcel.status === 'REMOVED') {
      return STATUS_LABELS[parcel.status];
    }

    return parcel.status;
  }

  protected messageUrl(gmailMessageId: string): string {
    return gmailMessageUrl(gmailMessageId);
  }

  protected isActionInFlight(parcelId: string): boolean {
    return this.actionInFlight().has(parcelId);
  }

  protected canMerge(): boolean {
    return this.selectedParcels.length >= 2 && !this.merging();
  }

  protected onOpenMerge(): void {
    if (!this.canMerge()) {
      return;
    }
    this.mergeDialogVisible.set(true);
  }

  protected async onMergeConfirmed(payload: MergeParcelsPayload): Promise<void> {
    if (this.merging()) {
      return;
    }

    this.merging.set(true);

    try {
      const survivor = await this.parcelsService.mergeParcels(payload);
      const selectedIds = new Set(payload.parcelIds);
      const remaining = this.parcels().filter(
        (parcel) => !selectedIds.has(parcel.id),
      );
      const archivedStatuses = new Set(['DELIVERED', 'REMOVED']);
      this.parcels.set(
        archivedStatuses.has(survivor.status)
          ? [survivor, ...remaining]
          : remaining,
      );
      this.selectedParcels = [];
      this.mergeDialogVisible.set(false);
      this.messages.add({
        severity: 'success',
        summary: 'Parcels merged',
        life: 4000,
      });
    } catch (err) {
      this.handleMergeError(err);
    } finally {
      this.merging.set(false);
    }
  }

  protected onRestore(parcel: ParcelDto): void {
    void this.runRestoreAction(parcel);
  }

  private handleMergeError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 400) {
      const body = err.error as { errors?: { message: string }[] };
      const firstMessage = body?.errors?.[0]?.message;
      this.messages.add({
        severity: 'error',
        summary: firstMessage ?? 'Could not merge parcels',
        life: 5000,
      });
      return;
    }

    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.messages.add({
        severity: 'warn',
        summary: 'Session expired',
        detail: 'Sign in with Google again to continue.',
        life: 8000,
      });
      return;
    }

    this.messages.add({
      severity: 'error',
      summary: 'Could not merge parcels',
      life: 4000,
    });
  }

  private async runRestoreAction(parcel: ParcelDto): Promise<void> {
    if (this.isActionInFlight(parcel.id)) {
      return;
    }

    const current = this.parcels();
    if (!current.some((row) => row.id === parcel.id)) {
      return;
    }

    this.setActionInFlight(parcel.id, true);
    this.parcels.set(current.filter((row) => row.id !== parcel.id));

    try {
      await this.parcelsService.reactivateParcel(parcel.id);
      this.messages.add({
        severity: 'success',
        summary: 'Restored to active list',
        life: 4000,
      });
    } catch (err) {
      await this.handleRestoreError(err, parcel);
    } finally {
      this.setActionInFlight(parcel.id, false);
    }
  }

  private async handleRestoreError(
    err: unknown,
    parcel: ParcelDto,
  ): Promise<void> {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        this.messages.add({
          severity: 'warn',
          summary: 'Session expired',
          detail: 'Sign in with Google again to continue.',
          life: 8000,
        });
      } else if (err.status === 404) {
        this.messages.add({
          severity: 'warn',
          summary: 'Parcel not found',
          life: 4000,
        });
      } else if (err.status === 400) {
        this.messages.add({
          severity: 'warn',
          summary: 'Parcel cannot be restored',
          life: 4000,
        });
      } else {
        this.messages.add({
          severity: 'error',
          summary: 'Could not restore parcel',
          life: 4000,
        });
      }
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'Could not restore parcel',
        life: 4000,
      });
    }

    try {
      const archived = await this.parcelsService.listArchived();
      this.parcels.set(archived);
    } catch {
      if (!this.parcels().some((row) => row.id === parcel.id)) {
        this.parcels.set([...this.parcels(), parcel]);
      }
    }
  }

  private setActionInFlight(parcelId: string, inFlight: boolean): void {
    const next = new Set(this.actionInFlight());
    if (inFlight) {
      next.add(parcelId);
    } else {
      next.delete(parcelId);
    }
    this.actionInFlight.set(next);
  }

  private async loadParcels(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      const parcels = await this.parcelsService.listArchived();
      this.parcels.set(parcels);
    } catch {
      this.loadError.set('Failed to load archived parcels.');
    } finally {
      this.loading.set(false);
    }
  }
}
