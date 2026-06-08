import { Strategy } from 'passport-google-oauth20';

type GoogleAuthorizationOptions = {
  accessType?: string;
  prompt?: string;
};

/**
 * passport-google-oauth20 reads accessType/prompt only in authorizationParams(),
 * not from Strategy constructor options. Default offline + consent so Google
 * returns a refresh_token on the token exchange.
 */
export class OfflineGoogleOAuthStrategy extends Strategy {
  authorizationParams(options: GoogleAuthorizationOptions) {
    return super.authorizationParams({
      ...options,
      accessType: options.accessType ?? 'offline',
      prompt: options.prompt ?? 'consent',
    });
  }
}
