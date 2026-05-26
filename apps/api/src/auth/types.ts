export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type GoogleProfile = {
  googleSub: string;
  email: string;
  displayName: string | null;
  refreshToken?: string;
};
