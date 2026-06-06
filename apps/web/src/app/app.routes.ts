import { Routes } from '@angular/router';

import { AppShellComponent } from './layout/app-shell/app-shell.component';

export const routes: Routes = [
  { path: '', component: AppShellComponent },
  { path: 'active', component: AppShellComponent },
  { path: 'archive', component: AppShellComponent },
  { path: 'settings', component: AppShellComponent },
  { path: '**', redirectTo: '' },
];
