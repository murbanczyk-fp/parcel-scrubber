import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AuthService } from '../../core/auth/auth.service';
import { gmailMessageUrl } from '../../core/parcels/gmail-message-url';
import { ParcelsService } from '../../core/parcels/parcels.service';
import type { ParcelDto } from '../../core/parcels/parcels.types';
import { ActiveListComponent } from './active-list.component';

describe('ActiveListComponent', () => {
  let listActiveMock: ReturnType<typeof vi.fn>;

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
    status: 'NEW',
    source: 'GMAIL',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    messages: [],
  };

  beforeEach(async () => {
    listActiveMock = vi.fn().mockResolvedValue([]);

    await TestBed.configureTestingModule({
      imports: [ActiveListComponent],
      providers: [
        MessageService,
        ConfirmationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ParcelsService,
          useValue: {
            listActive: listActiveMock,
            startSync: vi.fn(),
            getSyncJob: vi.fn(),
            deliverParcel: vi.fn(),
            removeParcel: vi.fn(),
            mergeParcels: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: { signIn: vi.fn() },
        },
      ],
    }).compileComponents();
  });

  async function renderWithParcels(
    parcels: ParcelDto[],
  ): Promise<ReturnType<typeof TestBed.createComponent<ActiveListComponent>>> {
    listActiveMock.mockResolvedValue(parcels);
    const fixture = TestBed.createComponent(ActiveListComponent);
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
      messages.query(By.css('.active-list__message-subject')),
    ).toBeNull();
  });

  it('disables Merge until at least two parcels are selected', async () => {
    const second: ParcelDto = { ...baseParcel, id: 'parcel-2', description: 'B' };
    const fixture = await renderWithParcels([baseParcel, second]);
    const component = fixture.componentInstance as ActiveListComponent & {
      canMerge: () => boolean;
    };

    expect(component.canMerge()).toBe(false);

    component.selectedParcels = [baseParcel];
    expect(component.canMerge()).toBe(false);

    component.selectedParcels = [baseParcel, second];
    expect(component.canMerge()).toBe(true);
  });

  it('opens the merge dialog with the current selection', async () => {
    const second: ParcelDto = { ...baseParcel, id: 'parcel-2', description: 'B' };
    const fixture = await renderWithParcels([baseParcel, second]);
    const component = fixture.componentInstance as ActiveListComponent & {
      canMerge: () => boolean;
      mergeDialogVisible: () => boolean;
      onOpenMerge: () => void;
    };

    component.selectedParcels = [baseParcel, second];
    component.onOpenMerge();
    fixture.detectChanges();

    expect(component.mergeDialogVisible()).toBe(true);
  });

  it('toasts the first validation error when merge returns 400', async () => {
    const second: ParcelDto = { ...baseParcel, id: 'parcel-2', description: 'B' };
    const mergeParcels = vi.fn().mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: {
          errors: [{ field: 'trackingNumber', message: 'Tracking already used' }],
        },
      }),
    );
    const addMessage = vi.fn();

    await TestBed.resetTestingModule();
    listActiveMock = vi.fn().mockResolvedValue([baseParcel, second]);
    await TestBed.configureTestingModule({
      imports: [ActiveListComponent],
      providers: [
        {
          provide: MessageService,
          useValue: { add: addMessage },
        },
        ConfirmationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ParcelsService,
          useValue: {
            listActive: listActiveMock,
            startSync: vi.fn(),
            getSyncJob: vi.fn(),
            deliverParcel: vi.fn(),
            removeParcel: vi.fn(),
            mergeParcels,
          },
        },
        {
          provide: AuthService,
          useValue: { signIn: vi.fn() },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ActiveListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance as ActiveListComponent & {
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
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'Tracking already used',
      }),
    );
    expect(component.parcels().map((p) => p.id)).toEqual([
      'parcel-1',
      'parcel-2',
    ]);
  });

  it('updates the list after a successful merge', async () => {
    const second: ParcelDto = { ...baseParcel, id: 'parcel-2', description: 'B' };
    const survivor: ParcelDto = {
      ...baseParcel,
      description: 'Merged',
      messages: [
        {
          gmailMessageId: 'msg-1',
          internalDate: '2026-01-15T10:00:00.000Z',
          subject: 'A',
          from: null,
        },
      ],
    };
    const mergeParcels = vi.fn().mockResolvedValue(survivor);

    await TestBed.resetTestingModule();
    listActiveMock = vi.fn().mockResolvedValue([baseParcel, second]);
    await TestBed.configureTestingModule({
      imports: [ActiveListComponent],
      providers: [
        MessageService,
        ConfirmationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ParcelsService,
          useValue: {
            listActive: listActiveMock,
            startSync: vi.fn(),
            getSyncJob: vi.fn(),
            deliverParcel: vi.fn(),
            removeParcel: vi.fn(),
            mergeParcels,
          },
        },
        {
          provide: AuthService,
          useValue: { signIn: vi.fn() },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ActiveListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance as ActiveListComponent & {
      parcels: () => ParcelDto[];
      mergeDialogVisible: () => boolean;
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
    expect(component.parcels()[0].description).toBe('Merged');
    expect(component.selectedParcels).toEqual([]);
    expect(component.mergeDialogVisible()).toBe(false);
  });
});
