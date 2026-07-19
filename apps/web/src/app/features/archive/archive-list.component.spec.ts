import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';

import { gmailMessageUrl } from '../../core/parcels/gmail-message-url';
import { ParcelsService } from '../../core/parcels/parcels.service';
import type { ParcelDto } from '../../core/parcels/parcels.types';
import { ArchiveListComponent } from './archive-list.component';

describe('ArchiveListComponent', () => {
  let listArchivedMock: ReturnType<typeof vi.fn>;

  const baseParcel: ParcelDto = {
    id: 'parcel-1',
    store: 'Allegro',
    description: 'Etui',
    carrier: 'INPOST',
    customCarrierLabel: null,
    trackingNumber: '520000012680041086770098',
    trackingUrl: 'https://inpost.pl/track',
    trackingUrlOverride: null,
    orderDate: '2026-01-15',
    status: 'DELIVERED',
    source: 'GMAIL',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    messages: [],
  };

  beforeEach(async () => {
    listArchivedMock = vi.fn().mockResolvedValue([]);

    await TestBed.configureTestingModule({
      imports: [ArchiveListComponent],
      providers: [
        MessageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ParcelsService,
          useValue: {
            listArchived: listArchivedMock,
            reactivateParcel: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  async function renderWithParcels(
    parcels: ParcelDto[],
  ): Promise<ReturnType<typeof TestBed.createComponent<ArchiveListComponent>>> {
    listArchivedMock.mockResolvedValue(parcels);
    const fixture = TestBed.createComponent(ArchiveListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('hides the expand toggler when messages are empty', async () => {
    const fixture = await renderWithParcels([baseParcel]);

    expect(
      fixture.debugElement.query(By.css('[data-testid="expand-parcel-parcel-1"]')),
    ).toBeNull();
  });

  it('shows the expand toggler when messages exist', async () => {
    const fixture = await renderWithParcels([
      {
        ...baseParcel,
        messages: [
          {
            gmailMessageId: 'msg-abc',
            internalDate: '2026-01-15T10:00:00.000Z',
            subject: 'Shipped',
            from: 'shop@example.com',
          },
        ],
      },
    ]);

    expect(
      fixture.debugElement.query(By.css('[data-testid="expand-parcel-parcel-1"]')),
    ).toBeTruthy();
  });

  it('renders Gmail links with FR-019 href, new tab, and external-link icon', async () => {
    const gmailMessageId = 'msg-abc123';
    const fixture = await renderWithParcels([
      {
        ...baseParcel,
        messages: [
          {
            gmailMessageId,
            internalDate: '2026-01-15T10:00:00.000Z',
            subject: 'Shipped',
            from: 'shop@example.com',
          },
        ],
      },
    ]);

    const toggler = fixture.debugElement.query(
      By.css('[data-testid="expand-parcel-parcel-1"]'),
    );
    expect(toggler).toBeTruthy();
    toggler.triggerEventHandler('click', new MouseEvent('click'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.debugElement.query(
      By.css(`[data-testid="gmail-link-${gmailMessageId}"]`),
    );
    expect(link).toBeTruthy();
    expect(link.nativeElement.getAttribute('href')).toBe(
      gmailMessageUrl(gmailMessageId),
    );
    expect(link.nativeElement.getAttribute('target')).toBe('_blank');
    expect(link.nativeElement.getAttribute('rel')).toContain('noopener');
    expect(link.query(By.css('.pi-external-link'))).toBeTruthy();
  });

  it('does not show truncated message id when subject is null', async () => {
    const gmailMessageId = 'msg-verylongtruncated';
    const fixture = await renderWithParcels([
      {
        ...baseParcel,
        messages: [
          {
            gmailMessageId,
            internalDate: '2026-01-15T10:00:00.000Z',
            subject: null,
            from: null,
          },
        ],
      },
    ]);

    const toggler = fixture.debugElement.query(
      By.css('[data-testid="expand-parcel-parcel-1"]'),
    );
    toggler.triggerEventHandler('click', new MouseEvent('click'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const messages = fixture.debugElement.query(
      By.css('[data-testid="parcel-messages-parcel-1"]'),
    );
    expect(messages).toBeTruthy();
    expect(messages.nativeElement.textContent).not.toContain(gmailMessageId);
    expect(messages.nativeElement.textContent).not.toContain('msg-very');
    expect(
      messages.query(By.css('.archive-list__message-subject')),
    ).toBeNull();
  });
});
