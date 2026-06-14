import { Carrier } from '@prisma/client';

import {
  ALLEGRO_SENDER_EMAILS,
  ALIEXPRESS_SENDER_EMAILS,
  detectStoreFromSender,
  parseEmailAddressFromHeader,
} from './detect-store-from-sender';

describe('parseEmailAddressFromHeader', () => {
  it('extracts email from angle-bracket form', () => {
    expect(
      parseEmailAddressFromHeader('Allegro <powiadomienia@allegro.pl>'),
    ).toBe('powiadomienia@allegro.pl');
  });

  it('extracts email from quoted display name', () => {
    expect(
      parseEmailAddressFromHeader(
        '"AliExpress" <transaction@notice.aliexpress.com>',
      ),
    ).toBe('transaction@notice.aliexpress.com');
  });

  it('returns bare address lowercased', () => {
    expect(parseEmailAddressFromHeader('Powiadomienia@AllegroMail.PL')).toBe(
      'powiadomienia@allegromail.pl',
    );
  });

  it('returns null for invalid input', () => {
    expect(parseEmailAddressFromHeader('')).toBeNull();
    expect(parseEmailAddressFromHeader('not-an-email')).toBeNull();
  });
});

describe('detectStoreFromSender', () => {
  it.each(ALLEGRO_SENDER_EMAILS)('detects Allegro for %s', (email) => {
    expect(detectStoreFromSender(`Allegro <${email}>`)).toBe('Allegro');
    expect(detectStoreFromSender(email)).toBe('Allegro');
  });

  it.each(ALIEXPRESS_SENDER_EMAILS)('detects AliExpress for %s', (email) => {
    expect(detectStoreFromSender(`AliExpress <${email}>`)).toBe('AliExpress');
    expect(detectStoreFromSender(email)).toBe('AliExpress');
  });

  it('returns null for unknown sender', () => {
    expect(detectStoreFromSender('shop@example.com')).toBeNull();
    expect(detectStoreFromSender('Random <noreply@other-store.pl>')).toBeNull();
  });
});

describe('Carrier enum sanity', () => {
  it('has five carrier values for prompt options', () => {
    expect(Object.values(Carrier)).toHaveLength(5);
  });
});
