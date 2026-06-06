import { Routes } from '@angular/router';

import { stubAuthGuard } from './core/auth/stub-auth.guard';
import { stubGuestGuard } from './core/auth/stub-guest.guard';
import { ActivePlaceholderComponent } from './features/active/active-placeholder.component';
import { ArchivePlaceholderComponent } from './features/archive/archive-placeholder.component';
import { LandingComponent } from './features/landing/landing.component';
import { SettingsPlaceholderComponent } from './features/settings/settings-placeholder.component';
import { AppShellComponent } from './layout/app-shell/app-shell.component';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: LandingComponent,
        canActivate: [stubGuestGuard],
      },
      {
        path: 'active',
        component: ActivePlaceholderComponent,
        canActivate: [stubAuthGuard],
      },
      {
        path: 'archive',
        component: ArchivePlaceholderComponent,
        canActivate: [stubAuthGuard],
      },
      {
        path: 'settings',
        component: SettingsPlaceholderComponent,
        canActivate: [stubAuthGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
