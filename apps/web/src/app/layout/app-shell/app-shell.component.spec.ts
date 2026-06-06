import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';

import { StubAuthService } from '../../core/auth/stub-auth.service';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([
          { path: '', component: AppShellComponent },
          { path: 'active', component: AppShellComponent },
        ]),
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show Login when logged out', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    const auth = TestBed.inject(StubAuthService);
    auth.logout();
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Login');
    expect(compiled.querySelector('[aria-label="Logout"]')).toBeFalsy();
  });

  it('should show Logout and Settings when logged in', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    const auth = TestBed.inject(StubAuthService);
    auth.login();
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[aria-label="Logout"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Settings"]')).toBeTruthy();
  });

  it('should navigate to /active when Login is clicked', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    const auth = TestBed.inject(StubAuthService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    auth.logout();
    fixture.detectChanges();
    await fixture.whenStable();

    const loginButton = fixture.debugElement.query(By.css('.app-shell__actions p-button'));
    expect(loginButton).toBeTruthy();

    loginButton.triggerEventHandler('onClick', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(auth.isLoggedIn()).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith(['/active']);
  });
});
