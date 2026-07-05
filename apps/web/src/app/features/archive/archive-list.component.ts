import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';

import { ParcelsService } from '../../core/parcels/parcels.service';
import type { ParcelDto } from '../../core/parcels/parcels.types';

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
  imports: [DatePipe, RouterLink, ButtonModule, CardModule, MessageModule, TableModule],
  templateUrl: './archive-list.component.html',
  styleUrl: './archive-list.component.scss',
})
export class ArchiveListComponent implements OnInit {
  private readonly parcelsService = inject(ParcelsService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly parcels = signal<ParcelDto[]>([]);

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
