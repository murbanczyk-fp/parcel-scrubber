import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';

import { AuthService } from '../../core/auth/auth.service';

type ParcelView = 'active' | 'archive';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    AvatarModule,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly viewOptions = [
    { label: 'Active', value: 'active' as ParcelView },
    { label: 'Archive', value: 'archive' as ParcelView },
  ];

  protected selectedView: ParcelView | null = null;

  ngOnInit(): void {
    this.syncSelectionFromRoute();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncSelectionFromRoute());
  }

  protected onViewChange(value: ParcelView | null): void {
    if (value) {
      void this.router.navigate(['/', value]);
    }
  }

  protected onLogin(): void {
    this.auth.signIn();
  }

  protected async onLogout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/']);
  }

  protected userInitials(): string {
    const user = this.auth.user();
    const label = user?.displayName ?? user?.email;
    if (!label) {
      return '?';
    }

    return label
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  private syncSelectionFromRoute(): void {
    const childPath =
      this.route.firstChild?.snapshot.url[0]?.path ??
      this.route.firstChild?.snapshot.routeConfig?.path ??
      '';

    if (childPath === 'archive') {
      this.selectedView = 'archive';
    } else if (childPath === 'active') {
      this.selectedView = 'active';
    } else {
      this.selectedView = null;
    }
  }
}
