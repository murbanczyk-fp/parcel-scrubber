import type { gmail_v1 } from 'googleapis';

export function resolveGmailLabelId(
  labels: gmail_v1.Schema$Label[] | null | undefined,
  labelName: string,
): string | null {
  const match = labels?.find((label) => label.name === labelName);
  return match?.id ?? null;
}
