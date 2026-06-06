import { computed, Injectable, signal } from '@angular/core';

export type StubUser = {
  displayName: string;
  email: string;
};

@Injectable({ providedIn: 'root' })
export class StubAuthService {
  readonly isLoggedIn = signal(false);

  readonly user = computed<StubUser | null>(() =>
    this.isLoggedIn()
      ? { displayName: 'Dev User', email: 'dev@local' }
      : null,
  );

  login(): void {
    this.isLoggedIn.set(true);
  }

  logout(): void {
    this.isLoggedIn.set(false);
  }
}
