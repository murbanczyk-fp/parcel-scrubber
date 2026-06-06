import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { SessionUser } from './session-user';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const testUser: SessionUser = {
    id: 'user-1',
    email: 'dev@local',
    displayName: 'Dev User',
    avatarUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts with loading true and no session', () => {
    expect(service.loading()).toBe(true);
    expect(service.session()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('loadSession sets session when authenticated', async () => {
    const promise = service.loadSession();

    const req = httpMock.expectOne('/api/auth/status');
    expect(req.request.method).toBe('GET');
    req.flush(testUser);

    await promise;

    expect(service.session()).toEqual(testUser);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('loadSession clears session when unauthenticated', async () => {
    service.session.set(testUser);

    const promise = service.loadSession();

    const req = httpMock.expectOne('/api/auth/status');
    req.flush({ authenticated: false });

    await promise;

    expect(service.session()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  it('loadSession clears session on network failure', async () => {
    service.session.set(testUser);

    const promise = service.loadSession();

    const req = httpMock.expectOne('/api/auth/status');
    req.error(new ProgressEvent('error'));

    await promise;

    expect(service.session()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  it('logout POST clears session', async () => {
    service.session.set(testUser);
    service.loading.set(false);

    const promise = service.logout();

    const req = httpMock.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true });

    await promise;

    expect(service.session()).toBeNull();
  });

  it('logout clears session on network failure', async () => {
    service.session.set(testUser);
    service.loading.set(false);

    const promise = service.logout();

    const req = httpMock.expectOne('/api/auth/logout');
    req.error(new ProgressEvent('error'));

    await promise;

    expect(service.session()).toBeNull();
  });

  it('signIn redirects to Google OAuth', () => {
    const assignMock = vi.fn();
    vi.stubGlobal('location', { assign: assignMock });

    service.signIn();

    expect(assignMock).toHaveBeenCalledWith('/api/auth/google');
  });
});
