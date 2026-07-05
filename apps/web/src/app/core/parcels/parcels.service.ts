import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ParcelDto, SyncJobDto } from './parcels.types';

@Injectable({ providedIn: 'root' })
export class ParcelsService {
  private readonly http = inject(HttpClient);

  listActive(): Promise<ParcelDto[]> {
    return firstValueFrom(
      this.http.get<ParcelDto[]>('/api/parcels', {
        params: { status: 'active' },
      }),
    );
  }

  listArchived(): Promise<ParcelDto[]> {
    return firstValueFrom(
      this.http.get<ParcelDto[]>('/api/parcels', {
        params: { status: 'archived' },
      }),
    );
  }

  startSync(): Promise<{ jobId: string }> {
    return firstValueFrom(
      this.http.post<{ jobId: string }>('/api/sync', null),
    );
  }

  getSyncJob(jobId: string): Promise<SyncJobDto> {
    return firstValueFrom(this.http.get<SyncJobDto>(`/api/sync/${jobId}`));
  }
}
