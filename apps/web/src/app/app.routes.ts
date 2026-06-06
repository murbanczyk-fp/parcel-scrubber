import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
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
        canActivate: [guestGuard],
      },
      {
        path: 'active',
        component: ActivePlaceholderComponent,
        canActivate: [authGuard],
      },
      {
        path: 'archive',
        component: ArchivePlaceholderComponent,
        canActivate: [authGuard],
      },
      {
        path: 'settings',
        component: SettingsPlaceholderComponent,
        canActivate: [authGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
