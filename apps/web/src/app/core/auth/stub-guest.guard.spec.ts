import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';

import { stubGuestGuard } from './stub-guest.guard';
import { StubAuthService } from './stub-auth.service';

describe('stubGuestGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: { navigate: vi.fn() },
        },
      ],
    }).compileComponents();

    TestBed.inject(StubAuthService).logout();
  });

  it('allows access when logged out', () => {
    const result = TestBed.runInInjectionContext(() => stubGuestGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects to /active when logged in', () => {
    TestBed.inject(StubAuthService).login();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const result = TestBed.runInInjectionContext(() => stubGuestGuard(route, state));

    expect(result).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/active']);
  });
});
