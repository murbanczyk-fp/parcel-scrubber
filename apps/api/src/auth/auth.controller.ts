import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { readSessionCookie } from './session-cookie';
import type { GoogleProfile, SessionUser } from './types';

type GoogleCallbackRequest = Request & { user: GoogleProfile };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // Passport redirects to Google.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: GoogleCallbackRequest,
    @Res() res: Response,
  ): Promise<void> {
    const sessionUser = await this.auth.upsertGoogleUser(req.user);
    const token = this.auth.signSession(sessionUser);

    res.cookie(this.auth.getCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.auth.useSecureCookies(),
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect('/');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(this.auth.getCookieName(), { path: '/' });
    return { ok: true };
  }

  @Get('status')
  async status(
    @Req() req: Request,
  ): Promise<SessionUser | { authenticated: false }> {
    const token = readSessionCookie(req, this.auth.getCookieName());
    if (!token) {
      return { authenticated: false };
    }

    const user = await this.auth.verifySession(token);
    return user ?? { authenticated: false };
  }
}
