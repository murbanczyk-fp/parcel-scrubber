import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { ActiveListComponent } from './features/active/active-list.component';
import { ArchivePlaceholderComponent } from './features/archive/archive-placeholder.component';
import { LandingComponent } from './features/landing/landing.component';
import { SettingsPageComponent } from './features/settings/settings-page.component';
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
        component: ActiveListComponent,
        canActivate: [authGuard],
      },
      {
        path: 'archive',
        component: ArchivePlaceholderComponent,
        canActivate: [authGuard],
      },
      {
        path: 'settings',
        component: SettingsPageComponent,
        canActivate: [authGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
