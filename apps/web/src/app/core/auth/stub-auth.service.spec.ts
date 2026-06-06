import { TestBed } from '@angular/core/testing';

import { StubAuthService } from './stub-auth.service';

describe('StubAuthService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(StubAuthService).logout();
  });

  it('login() sets isLoggedIn to true', () => {
    const auth = TestBed.inject(StubAuthService);

    auth.login();

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()?.displayName).toBe('Dev User');
  });

  it('logout() sets isLoggedIn to false', () => {
    const auth = TestBed.inject(StubAuthService);

    auth.login();
    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.user()).toBeNull();
  });
});
