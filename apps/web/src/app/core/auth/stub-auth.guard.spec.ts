import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';

import { stubAuthGuard } from './stub-auth.guard';
import { StubAuthService } from './stub-auth.service';

describe('stubAuthGuard', () => {
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

  it('allows access when logged in', () => {
    TestBed.inject(StubAuthService).login();

    const result = TestBed.runInInjectionContext(() => stubAuthGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects to landing when logged out', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const result = TestBed.runInInjectionContext(() => stubAuthGuard(route, state));

    expect(result).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
