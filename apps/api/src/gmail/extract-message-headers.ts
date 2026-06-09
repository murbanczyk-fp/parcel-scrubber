import type { gmail_v1 } from 'googleapis';

export function extractMessageHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[] | null | undefined,
): { from: string; date: string; subject: string } {
  const find = (name: string): string => {
    const header = headers?.find(
      (entry) => entry.name?.toLowerCase() === name.toLowerCase(),
    );
    return header?.value ?? '';
  };

  return {
    from: find('From'),
    date: find('Date'),
    subject: find('Subject'),
  };
}
