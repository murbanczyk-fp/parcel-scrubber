import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { StubAuthService } from './stub-auth.service';

export const stubGuestGuard: CanActivateFn = () => {
  const auth = inject(StubAuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    void router.navigate(['/active']);
    return false;
  }

  return true;
};
