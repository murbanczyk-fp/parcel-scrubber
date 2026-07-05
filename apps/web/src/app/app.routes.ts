import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { ActiveListComponent } from './features/active/active-list.component';
import { ArchiveListComponent } from './features/archive/archive-list.component';
import { LandingComponent } from './features/landing/landing.component';
import { ParcelCreatePageComponent } from './features/parcels/parcel-create-page.component';
import { ParcelEditPageComponent } from './features/parcels/parcel-edit-page.component';
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
        path: 'active/new',
        component: ParcelCreatePageComponent,
        canActivate: [authGuard],
      },
      {
        path: 'active/:id/edit',
        component: ParcelEditPageComponent,
        canActivate: [authGuard],
        data: { returnPath: '/active' },
      },
      {
        path: 'archive',
        component: ArchiveListComponent,
        canActivate: [authGuard],
      },
      {
        path: 'archive/:id/edit',
        component: ParcelEditPageComponent,
        canActivate: [authGuard],
        data: { returnPath: '/archive' },
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
