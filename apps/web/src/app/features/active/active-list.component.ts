import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { TableModule } from 'primeng/table';

import { AuthService } from '../../core/auth/auth.service';
import { ParcelsService } from '../../core/parcels/parcels.service';
import type { ParcelDto, SyncJobDto } from '../../core/parcels/parcels.types';

const CARRIER_LABELS: Record<ParcelDto['carrier'], string> = {
  INPOST: 'InPost',
  POCZTA_POLSKA: 'Poczta Polska',
  DPD: 'DPD',
  DHL: 'DHL',
  CUSTOM: 'Custom',
};

@Component({
  selector: 'app-active-list',
  imports: [
    DatePipe,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    MessageModule,
    ProgressBarModule,
    TableModule,
  ],
  templateUrl: './active-list.component.html',
  styleUrl: './active-list.component.scss',
})
export class ActiveListComponent implements OnInit, OnDestroy {
  private readonly parcelsService = inject(ParcelsService);
  private readonly authService = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly parcels = signal<ParcelDto[]>([]);
  protected readonly syncing = signal(false);
  protected readonly syncJob = signal<SyncJobDto | null>(null);
  protected readonly authRequired = signal(false);
  protected readonly actionInFlight = signal<ReadonlySet<string>>(new Set());

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    void this.loadParcels();
  }

  ngOnDestroy(): void {
    this.clearPoll();
  }

  protected carrierLabel(parcel: ParcelDto): string {
    if (parcel.carrier === 'CUSTOM') {
      return parcel.customCarrierLabel ?? CARRIER_LABELS.CUSTOM;
    }

    return CARRIER_LABELS[parcel.carrier];
  }

  protected progressPercent(job: SyncJobDto): number {
    if (job.total === 0) {
      return job.phase === 'done' ? 100 : 0;
    }

    return Math.round((job.processed / job.total) * 100);
  }

  protected async onSync(): Promise<void> {
    if (this.syncing()) {
      return;
    }

    this.syncing.set(true);
    this.authRequired.set(false);
    this.syncJob.set(null);

    try {
      const { jobId } = await this.parcelsService.startSync();
      await this.pollUntilDone(jobId);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.messages.add({
          severity: 'warn',
          summary: 'Sync already running',
          detail: 'Wait for the current sync to finish before starting another.',
          life: 4000,
        });
        return;
      }

      this.messages.add({
        severity: 'error',
        summary: 'Failed to start sync',
        life: 4000,
      });
    } finally {
      this.syncing.set(false);
      this.syncJob.set(null);
    }
  }

  protected onReLogin(): void {
    this.authService.signIn();
  }

  protected isActionInFlight(parcelId: string): boolean {
    return this.actionInFlight().has(parcelId);
  }

  protected onDeliver(parcel: ParcelDto): void {
    void this.runParcelAction(
      parcel,
      () => this.parcelsService.deliverParcel(parcel.id),
      'Marked as delivered',
    );
  }

  protected onRemove(parcel: ParcelDto): void {
    this.confirmationService.confirm({
      message:
        'Remove this parcel from your active list? It will move to archive.',
      accept: () => {
        void this.runParcelAction(
          parcel,
          () => this.parcelsService.removeParcel(parcel.id),
          'Removed from active list',
        );
      },
    });
  }

  private async runParcelAction(
    parcel: ParcelDto,
    action: () => Promise<ParcelDto>,
    successSummary: string,
  ): Promise<void> {
    if (this.isActionInFlight(parcel.id)) {
      return;
    }

    const current = this.parcels();
    const index = current.findIndex((row) => row.id === parcel.id);
    if (index === -1) {
      return;
    }

    this.setActionInFlight(parcel.id, true);
    this.parcels.set(current.filter((row) => row.id !== parcel.id));

    try {
      await action();
      this.messages.add({
        severity: 'success',
        summary: successSummary,
        life: 4000,
      });
    } catch {
      const restored = [...this.parcels()];
      restored.splice(index, 0, parcel);
      this.parcels.set(restored);
      this.messages.add({
        severity: 'error',
        summary: 'Could not update parcel',
        life: 4000,
      });
    } finally {
      this.setActionInFlight(parcel.id, false);
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
      const parcels = await this.parcelsService.listActive();
      this.parcels.set(parcels);
    } catch {
      this.loadError.set('Failed to load parcels.');
    } finally {
      this.loading.set(false);
    }
  }

  private pollUntilDone(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const poll = async (): Promise<void> => {
        try {
          const job = await this.parcelsService.getSyncJob(jobId);
          this.syncJob.set(job);

          if (job.status === 'completed') {
            await this.loadParcels();
            this.messages.add({
              severity: 'success',
              summary: 'Sync complete',
              detail: `Imported ${job.imported}, skipped ${job.skipped}, failed ${job.failed}`,
              life: 5000,
            });
            resolve();
            return;
          }

          if (job.status === 'failed') {
            if (job.errorCode === 'GMAIL_AUTH_REQUIRED') {
              this.authRequired.set(true);
              this.messages.add({
                severity: 'error',
                summary: 'Gmail re-authentication required',
                detail: 'Sign in with Google again to restore Gmail access.',
                life: 8000,
              });
            } else {
              this.messages.add({
                severity: 'error',
                summary: 'Sync failed',
                detail: job.error ?? 'An unexpected error occurred.',
                life: 5000,
              });
            }

            resolve();
            return;
          }

          this.pollTimer = setTimeout(() => void poll(), 1000);
        } catch (err) {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.messages.add({
              severity: 'warn',
              summary: 'Sync session expired',
              detail:
                'The sync job is no longer available. You can start a new sync.',
              life: 5000,
            });
          } else {
            this.messages.add({
              severity: 'error',
              summary: 'Failed to check sync status',
              life: 4000,
            });
          }

          resolve();
        }
      };

      void poll();
    });
  }

  private clearPoll(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
