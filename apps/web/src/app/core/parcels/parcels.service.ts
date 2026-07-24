import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreateParcelPayload,
  MergeParcelsPayload,
  ParcelDto,
  SyncJobDto,
  UpdateParcelPayload,
} from './parcels.types';

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

  getParcel(id: string): Promise<ParcelDto> {
    return firstValueFrom(this.http.get<ParcelDto>(`/api/parcels/${id}`));
  }

  createParcel(body: CreateParcelPayload): Promise<ParcelDto> {
    return firstValueFrom(this.http.post<ParcelDto>('/api/parcels', body));
  }

  updateParcel(id: string, body: UpdateParcelPayload): Promise<ParcelDto> {
    return firstValueFrom(
      this.http.patch<ParcelDto>(`/api/parcels/${id}`, body),
    );
  }

  mergeParcels(body: MergeParcelsPayload): Promise<ParcelDto> {
    return firstValueFrom(
      this.http.post<ParcelDto>('/api/parcels/merge', body),
    );
  }

  deliverParcel(id: string): Promise<ParcelDto> {
    return firstValueFrom(
      this.http.post<ParcelDto>(`/api/parcels/${id}/deliver`, null),
    );
  }

  removeParcel(id: string): Promise<ParcelDto> {
    return firstValueFrom(
      this.http.post<ParcelDto>(`/api/parcels/${id}/remove`, null),
    );
  }

  reactivateParcel(id: string): Promise<ParcelDto> {
    return firstValueFrom(
      this.http.post<ParcelDto>(`/api/parcels/${id}/reactivate`, null),
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
