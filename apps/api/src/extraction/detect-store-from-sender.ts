import { MerchantStore } from './types';

export const ALLEGRO_SENDER_EMAILS = [
  'powiadomienia@allegro.pl',
  'powiadomienia@allegromail.pl',
] as const;

export const ALIEXPRESS_SENDER_EMAILS = [
  'transaction@notice.aliexpress.com',
] as const;

export const MERCHANT_SENDER_EMAILS: Record<MerchantStore, readonly string[]> =
  {
    Allegro: ALLEGRO_SENDER_EMAILS,
    AliExpress: ALIEXPRESS_SENDER_EMAILS,
  };

const STORE_BY_EMAIL = new Map<string, MerchantStore>(
  Object.entries(MERCHANT_SENDER_EMAILS).flatMap(([store, emails]) =>
    emails.map((email) => [email, store as MerchantStore]),
  ),
);

export function parseEmailAddressFromHeader(fromHeader: string): string | null {
  const trimmed = fromHeader.trim();
  if (!trimmed) {
    return null;
  }

  const angleBracketMatch = /<([^>]+)>/.exec(trimmed);
  const candidate = angleBracketMatch ? angleBracketMatch[1] : trimmed;

  const email = candidate
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

export function detectStoreFromSender(
  fromHeader: string,
): MerchantStore | null {
  const email = parseEmailAddressFromHeader(fromHeader);
  if (!email) {
    return null;
  }

  return STORE_BY_EMAIL.get(email) ?? null;
}
