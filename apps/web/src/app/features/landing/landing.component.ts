import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { StubAuthService } from '../../core/auth/stub-auth.service';

@Component({
  selector: 'app-landing',
  imports: [ButtonModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  private readonly auth = inject(StubAuthService);
  private readonly router = inject(Router);

  protected onLogin(): void {
    this.auth.login();
    void this.router.navigate(['/active']);
  }
}
