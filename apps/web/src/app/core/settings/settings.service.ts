import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  EffectiveUserSettings,
  PatchUserSettings,
} from './settings.types';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  load(): Promise<EffectiveUserSettings> {
    return firstValueFrom(
      this.http.get<EffectiveUserSettings>('/api/settings'),
    );
  }

  save(patch: PatchUserSettings): Promise<EffectiveUserSettings> {
    return firstValueFrom(
      this.http.patch<EffectiveUserSettings>('/api/settings', patch),
    );
  }
}
