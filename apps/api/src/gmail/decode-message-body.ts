import type { gmail_v1 } from 'googleapis';

export function decodeMessageBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  if (!payload) {
    return '';
  }

  const plain = findPartByMimeType(payload, 'text/plain');
  if (plain) {
    return decodePartBody(plain);
  }

  const html = findPartByMimeType(payload, 'text/html');
  if (html) {
    return stripHtmlTags(decodePartBody(html));
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return '';
}

function findPartByMimeType(
  part: gmail_v1.Schema$MessagePart,
  mimeType: string,
): gmail_v1.Schema$MessagePart | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return part;
  }

  for (const child of part.parts ?? []) {
    if (!child) {
      continue;
    }

    const found = findPartByMimeType(child, mimeType);
    if (found) {
      return found;
    }
  }

  return null;
}

function decodePartBody(part: gmail_v1.Schema$MessagePart): string {
  return decodeBase64Url(part.body?.data ?? '');
}

function decodeBase64Url(data: string): string {
  if (!data) {
    return '';
  }

  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
