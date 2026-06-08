import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;

  const effectiveSettings = {
    gmailScanLabel: 'ParcelScrubber',
    scanPeriodDays: 30,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('load GETs /api/settings', async () => {
    const promise = service.load();

    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('GET');
    req.flush(effectiveSettings);

    await expect(promise).resolves.toEqual(effectiveSettings);
  });

  it('save PATCHes /api/settings with a partial body', async () => {
    const patch = { gmailScanLabel: 'MyLabel' };
    const updated = { ...effectiveSettings, gmailScanLabel: 'MyLabel' };

    const promise = service.save(patch);

    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(patch);
    req.flush(updated);

    await expect(promise).resolves.toEqual(updated);
  });
});
