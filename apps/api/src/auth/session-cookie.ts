import type { Request } from 'express';

export function readSessionCookie(
  req: Request,
  cookieName: string,
): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[cookieName];
  return typeof value === 'string' ? value : undefined;
}
