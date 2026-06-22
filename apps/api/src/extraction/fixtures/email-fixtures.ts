import { FetchedGmailMessage } from '../../gmail/types';

export const allegroInPostShipmentFixture: FetchedGmailMessage = {
  from: 'Allegro <powiadomienia@allegro.pl>',
  date: '2026-01-15T10:00:00.000Z',
  subject: 'Twoja przesyłka została nadana',
  body: [
    'Dzień dobry,',
    '',
    'Twoja przesyłka z zamówienia nr 123456789 została nadana.',
    '',
    'Numer przesyłki: 520000012680041086770098',
    'Przewoźnik: InPost Paczkomaty',
    'Opis: Etui na telefon',
    '',
    'Pozdrawiamy,',
    'Allegro',
  ].join('\n'),
};

export const allegroInPostHtmlStrippedFixture: FetchedGmailMessage = {
  from: 'Allegro <powiadomienia@allegromail.pl>',
  date: '2026-01-20T14:30:00.000Z',
  subject: 'Informacja o wysyłce',
  body: [
    'Twoja przesyłka została nadana',
    'Numer przesyłki: 520000012680041086770098',
    'Przewoźnik: InPost',
    'Śledzenie: https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
    'Allegro.pl',
  ].join('\n'),
};

export const aliExpressDhlShipmentFixture: FetchedGmailMessage = {
  from: 'AliExpress <transaction@notice.aliexpress.com>',
  date: '2026-02-01T08:30:00.000Z',
  subject: 'Your package has been shipped',
  body: [
    'Hello,',
    '',
    'Your order has shipped.',
    'Tracking number: 3SBCC000123456',
    'Carrier: DHL',
    'Item: USB-C cable',
    '',
    'Thank you for shopping with AliExpress.',
  ].join('\n'),
};

export const allegroMarketingNonShipmentFixture: FetchedGmailMessage = {
  from: 'Allegro <powiadomienia@allegromail.pl>',
  date: '2026-03-01T12:00:00.000Z',
  subject: 'Sprawdź nowe promocje na Allegro',
  body: 'Zobacz najlepsze okazje tygodnia. Brak informacji o przesyłce.',
};

export type ExtractionFixtureExpectation =
  | {
      kind: 'shipment';
      store: 'Allegro' | 'AliExpress';
      trackingNumberPrefix: string;
      carrier: string;
    }
  | {
      kind: 'non-shipment';
      store: 'Allegro' | 'AliExpress';
    };

export const extractionFixtureCases: Array<{
  name: string;
  message: FetchedGmailMessage;
  openRouterResponse: Record<string, unknown>;
  expected: ExtractionFixtureExpectation;
}> = [
  {
    name: 'Allegro InPost shipment',
    message: allegroInPostShipmentFixture,
    openRouterResponse: {
      trackingNumber: '520000012680041086770098',
      carrier: 'INPOST',
      customCarrierLabel: null,
      description: 'Etui na telefon',
    },
    expected: {
      kind: 'shipment',
      store: 'Allegro',
      trackingNumberPrefix: '5200000',
      carrier: 'INPOST',
    },
  },
  {
    name: 'Allegro HTML-stripped InPost shipment',
    message: allegroInPostHtmlStrippedFixture,
    openRouterResponse: {
      trackingNumber: '520000012680041086770098',
      carrier: 'INPOST',
      customCarrierLabel: null,
      description: null,
    },
    expected: {
      kind: 'shipment',
      store: 'Allegro',
      trackingNumberPrefix: '5200000',
      carrier: 'INPOST',
    },
  },
  {
    name: 'AliExpress DHL shipment',
    message: aliExpressDhlShipmentFixture,
    openRouterResponse: {
      trackingNumber: '3SBCC000123456',
      carrier: 'DHL',
      customCarrierLabel: null,
      description: 'USB-C cable',
    },
    expected: {
      kind: 'shipment',
      store: 'AliExpress',
      trackingNumberPrefix: '3SBCC',
      carrier: 'DHL',
    },
  },
  {
    name: 'Allegro marketing non-shipment',
    message: allegroMarketingNonShipmentFixture,
    openRouterResponse: {
      trackingNumber: null,
      carrier: 'CUSTOM',
      customCarrierLabel: null,
      description: 'Promocje',
    },
    expected: {
      kind: 'non-shipment',
      store: 'Allegro',
    },
  },
];
