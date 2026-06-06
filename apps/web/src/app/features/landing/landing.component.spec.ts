import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AuthService } from '../../core/auth/auth.service';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
    }).compileComponents();

    const auth = TestBed.inject(AuthService);
    auth.loading.set(false);
    auth.session.set(null);
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(LandingComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should call signIn when Login is clicked', async () => {
    const fixture = TestBed.createComponent(LandingComponent);
    const auth = TestBed.inject(AuthService);
    const signInSpy = vi.spyOn(auth, 'signIn');

    fixture.detectChanges();
    await fixture.whenStable();

    const loginButton = fixture.debugElement.query(By.css('p-button'));
    expect(loginButton).toBeTruthy();

    loginButton.triggerEventHandler('onClick', null);

    expect(signInSpy).toHaveBeenCalled();
  });
});
