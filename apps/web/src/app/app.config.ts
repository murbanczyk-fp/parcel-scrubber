import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { ParcelScrubberPreset } from './theme/parcel-scrubber.preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideAppInitializer(() => inject(AuthService).loadSession()),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: ParcelScrubberPreset,
      },
    }),
    MessageService,
  ],
};
