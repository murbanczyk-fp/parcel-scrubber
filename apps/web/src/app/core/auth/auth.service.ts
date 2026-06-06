import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStatus, isAuthenticatedStatus, SessionUser } from './session-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly session = signal<SessionUser | null>(null);
  readonly loading = signal(true);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly user = computed(() => this.session());

  loadSession(): Promise<void> {
    return firstValueFrom(this.http.get<AuthStatus>('/api/auth/status'))
      .then((status) => {
        this.session.set(isAuthenticatedStatus(status) ? status : null);
      })
      .catch(() => {
        this.session.set(null);
      })
      .finally(() => {
        this.loading.set(false);
      });
  }

  signIn(): void {
    window.location.assign('/api/auth/google');
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<{ ok: true }>('/api/auth/logout', null)).then(
      () => {
        this.session.set(null);
      },
    );
  }
}
