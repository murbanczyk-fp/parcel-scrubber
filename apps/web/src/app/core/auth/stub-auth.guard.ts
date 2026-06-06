import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { StubAuthService } from './stub-auth.service';

export const stubAuthGuard: CanActivateFn = () => {
  const auth = inject(StubAuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  void router.navigate(['/']);
  return false;
};
