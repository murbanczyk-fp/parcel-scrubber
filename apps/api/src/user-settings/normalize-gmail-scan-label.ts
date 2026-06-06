export const GMAIL_SCAN_LABEL_MAX_LENGTH = 100;

export function normalizeGmailScanLabel(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new Error('Gmail scan label must not be empty');
  }

  if (trimmed.length > GMAIL_SCAN_LABEL_MAX_LENGTH) {
    throw new Error(
      `Gmail scan label must be at most ${GMAIL_SCAN_LABEL_MAX_LENGTH} characters`,
    );
  }

  return trimmed;
}
