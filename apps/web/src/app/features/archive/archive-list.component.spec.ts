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
            mergeParcels: vi.fn(),
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

  it('disables Merge until at least two parcels are selected', async () => {
    const second: ParcelDto = {
      ...baseParcel,
      id: 'parcel-2',
      status: 'REMOVED',
      description: 'B',
    };
    const fixture = await renderWithParcels([baseParcel, second]);
    const component = fixture.componentInstance as ArchiveListComponent & {
      canMerge: () => boolean;
    };

    expect(component.canMerge()).toBe(false);

    component.selectedParcels = [baseParcel, second];
    fixture.detectChanges();
    expect(component.canMerge()).toBe(true);
  });

  it('opens the merge dialog with the current selection', async () => {
    const second: ParcelDto = {
      ...baseParcel,
      id: 'parcel-2',
      status: 'REMOVED',
      description: 'B',
    };
    const fixture = await renderWithParcels([baseParcel, second]);
    const component = fixture.componentInstance as ArchiveListComponent & {
      mergeDialogVisible: () => boolean;
      onOpenMerge: () => void;
    };

    component.selectedParcels = [baseParcel, second];
    component.onOpenMerge();
    fixture.detectChanges();

    expect(component.mergeDialogVisible()).toBe(true);
  });

  it('updates the archive list after a successful merge', async () => {
    const second: ParcelDto = {
      ...baseParcel,
      id: 'parcel-2',
      status: 'REMOVED',
      description: 'B',
    };
    const survivor: ParcelDto = {
      ...baseParcel,
      status: 'DELIVERED',
      description: 'Merged',
    };
    const mergeParcels = vi.fn().mockResolvedValue(survivor);

    await TestBed.resetTestingModule();
    listArchivedMock = vi.fn().mockResolvedValue([baseParcel, second]);
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
            mergeParcels,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ArchiveListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance as ArchiveListComponent & {
      parcels: () => ParcelDto[];
      onMergeConfirmed: (payload: {
        parcelIds: string[];
        fields: {
          store: string | null;
          description: string | null;
          carrier: ParcelDto['carrier'];
          customCarrierLabel: string | null;
          trackingNumber: string | null;
          trackingUrl: string | null;
        };
      }) => Promise<void>;
    };
    component.selectedParcels = [baseParcel, second];
    await component.onMergeConfirmed({
      parcelIds: ['parcel-1', 'parcel-2'],
      fields: {
        store: 'Allegro',
        description: 'Merged',
        carrier: 'INPOST',
        customCarrierLabel: null,
        trackingNumber: '520000012680041086770098',
        trackingUrl: null,
      },
    });
    fixture.detectChanges();

    expect(mergeParcels).toHaveBeenCalled();
    expect(component.parcels().map((p) => p.id)).toEqual(['parcel-1']);
    expect(component.parcels()[0].status).toBe('DELIVERED');
    expect(component.selectedParcels).toEqual([]);
  });
});
