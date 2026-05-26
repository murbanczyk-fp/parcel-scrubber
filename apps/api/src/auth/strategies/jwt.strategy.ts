import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-custom';
import { AuthService } from '../auth.service';
import { readSessionCookie } from '../session-cookie';
import type { SessionUser } from '../types';

@Injectable()
export class JwtCookieStrategy extends PassportStrategy(
  Strategy,
  'jwt-cookie',
) {
  constructor(private readonly auth: AuthService) {
    super();
  }

  async validate(req: Request): Promise<SessionUser> {
    const token = readSessionCookie(req, this.auth.getCookieName());
    if (!token) {
      throw new UnauthorizedException();
    }

    const user = await this.auth.verifySession(token);
    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
