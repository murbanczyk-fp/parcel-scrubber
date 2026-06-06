import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';

import { guestGuard } from './guest.guard';
import { AuthService } from './auth.service';

describe('guestGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  const testUser = {
    id: 'user-1',
    email: 'dev@local',
    displayName: 'Dev User',
    avatarUrl: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: { navigate: vi.fn() },
        },
      ],
    }).compileComponents();

    const auth = TestBed.inject(AuthService);
    auth.loading.set(false);
    auth.session.set(null);
  });

  it('allows access when logged out', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects to /active when logged in', () => {
    TestBed.inject(AuthService).session.set(testUser);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const result = TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(result).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/active']);
  });
});
