import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile, SessionUser } from './types';

type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async upsertGoogleUser(profile: GoogleProfile): Promise<SessionUser> {
    const user = await this.prisma.user.upsert({
      where: { googleSub: profile.googleSub },
      create: {
        googleSub: profile.googleSub,
        email: profile.email,
        displayName: profile.displayName,
        refreshToken: profile.refreshToken ?? null,
      },
      update: {
        email: profile.email,
        displayName: profile.displayName,
        ...(profile.refreshToken ? { refreshToken: profile.refreshToken } : {}),
      },
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
  }

  signSession(user: SessionUser): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwt.sign(payload);
  }

  async verifySession(token: string): Promise<SessionUser | null> {
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      };
    } catch {
      return null;
    }
  }

  getCookieName(): string {
    return 'session';
  }

  useSecureCookies(): boolean {
    return this.config.get('COOKIE_SECURE') === 'true';
  }
}
