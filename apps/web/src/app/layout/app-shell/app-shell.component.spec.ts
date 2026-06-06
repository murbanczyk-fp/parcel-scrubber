import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  const testUser = {
    id: 'user-1',
    email: 'dev@local',
    displayName: 'Dev User',
    avatarUrl: null,
  };

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

    const auth = TestBed.inject(AuthService);
    auth.loading.set(false);
    auth.session.set(null);
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show Login when logged out', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Login');
    expect(compiled.querySelector('[aria-label="Logout"]')).toBeFalsy();
  });

  it('should show Logout and Settings when logged in', async () => {
    TestBed.inject(AuthService).session.set(testUser);
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[aria-label="Logout"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Settings"]')).toBeTruthy();
  });

  it('should call signIn when Login is clicked', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    const auth = TestBed.inject(AuthService);
    const signInSpy = vi.spyOn(auth, 'signIn');

    fixture.detectChanges();
    await fixture.whenStable();

    const loginButton = fixture.debugElement.query(By.css('.app-shell__actions p-button'));
    expect(loginButton).toBeTruthy();

    loginButton.triggerEventHandler('onClick', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(signInSpy).toHaveBeenCalled();
  });

  it('should call logout and navigate home when Logout is clicked', async () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    const auth = TestBed.inject(AuthService);
    auth.session.set(testUser);
    auth.loading.set(false);

    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');

    fixture.detectChanges();
    await fixture.whenStable();

    const logoutButton = fixture.debugElement.query(
      By.css('.app-shell__actions p-button[icon="pi pi-sign-out"]'),
    );
    expect(logoutButton).toBeTruthy();

    logoutButton.triggerEventHandler('onClick', null);
    await fixture.whenStable();

    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
