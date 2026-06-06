import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-google-oauth20';
import type { GoogleProfile } from '../types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const options: StrategyOptions = {
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    };
    super({
      ...options,
      accessType: 'offline',
      prompt: 'consent',
    } as StrategyOptions);
  }

  validate(
    _accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
  ): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Google account has no email');
    }

    return {
      googleSub: profile.id,
      email,
      displayName: profile.displayName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      refreshToken,
    };
  }
}
