export type GmailMessageBody = {
  body: string;
};

export class GmailAuthError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GmailAuthError';
  }
}
