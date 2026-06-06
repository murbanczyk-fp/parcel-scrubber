import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-landing',
  imports: [ButtonModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  private readonly auth = inject(AuthService);

  protected onLogin(): void {
    this.auth.signIn();
  }
}
