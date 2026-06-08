import { buildGmailListQuery } from './build-gmail-list-query';

describe('buildGmailListQuery', () => {
  it('builds label and newer_than query', () => {
    expect(buildGmailListQuery('ParcelScrubber', 30)).toBe(
      'label:ParcelScrubber newer_than:30d',
    );
  });

  it('preserves label name casing and spacing', () => {
    expect(buildGmailListQuery('My Custom Label', 7)).toBe(
      'label:My Custom Label newer_than:7d',
    );
  });
});
