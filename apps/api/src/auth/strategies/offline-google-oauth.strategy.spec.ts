import { OfflineGoogleOAuthStrategy } from './offline-google-oauth.strategy';

describe('OfflineGoogleOAuthStrategy', () => {
  it('defaults authorization params to offline access with consent prompt', () => {
    const strategy = new OfflineGoogleOAuthStrategy(
      {
        clientID: 'client-id',
        clientSecret: 'client-secret',
        callbackURL: 'http://localhost/callback',
      },
      () => undefined,
    );

    expect(strategy.authorizationParams({})).toEqual({
      access_type: 'offline',
      prompt: 'consent',
    });
  });

  it('allows authenticate-time overrides', () => {
    const strategy = new OfflineGoogleOAuthStrategy(
      {
        clientID: 'client-id',
        clientSecret: 'client-secret',
        callbackURL: 'http://localhost/callback',
      },
      () => undefined,
    );

    expect(
      strategy.authorizationParams({
        accessType: 'online',
        prompt: 'select_account',
      }),
    ).toEqual({
      access_type: 'online',
      prompt: 'select_account',
    });
  });
});
