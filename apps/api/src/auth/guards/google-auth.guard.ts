import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Belt-and-suspenders: strategy defaults access_type=offline, but the guard
 * also passes Google params at authenticate time for passport-google-oauth20.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(): { accessType: 'offline'; prompt: 'consent' } {
    return {
      accessType: 'offline',
      prompt: 'consent',
    };
  }
}
