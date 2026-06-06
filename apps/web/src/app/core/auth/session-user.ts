export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AuthStatus = SessionUser | { authenticated: false };

export function isAuthenticatedStatus(status: AuthStatus): status is SessionUser {
  return 'id' in status;
}
