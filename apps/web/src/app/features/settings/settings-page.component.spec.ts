import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { By } from '@angular/platform-browser';

import { SettingsService } from '../../core/settings/settings.service';
import { SettingsPageComponent } from './settings-page.component';

describe('SettingsPageComponent', () => {
  const defaults = {
    gmailScanLabel: 'ParcelScrubber',
    scanPeriodDays: 30,
  };

  let loadMock: ReturnType<typeof vi.fn>;
  let saveMock: ReturnType<typeof vi.fn>;
  let clearParcelDataMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    loadMock = vi.fn().mockResolvedValue(defaults);
    saveMock = vi.fn().mockResolvedValue({
      ...defaults,
      gmailScanLabel: 'Custom',
    });
    clearParcelDataMock = vi.fn().mockResolvedValue({
      deletedParcelEmails: 2,
      deletedStatusEvents: 3,
      deletedParcels: 4,
      deletedGmailMessages: 5,
    });

    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [
        MessageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SettingsService,
          useValue: {
            load: loadMock,
            save: saveMock,
            clearParcelData: clearParcelDataMock,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance).toBeTruthy();
    expect(loadMock).toHaveBeenCalled();
  });

  async function renderLoadedForm(): Promise<ReturnType<
    typeof TestBed.createComponent<SettingsPageComponent>
  >> {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('disables Save when the form is pristine', async () => {
    const fixture = await renderLoadedForm();

    const saveButton = fixture.debugElement.query(
      By.css('[data-testid="save-settings"]'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton.componentInstance.disabled).toBe(true);
  });

  it('calls save with only dirty fields', async () => {
    const fixture = await renderLoadedForm();

    fixture.componentInstance['form'].controls.gmailScanLabel.setValue('Custom');
    fixture.componentInstance['form'].controls.gmailScanLabel.markAsDirty();
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);
    await fixture.whenStable();

    expect(saveMock).toHaveBeenCalledWith({ gmailScanLabel: 'Custom' });
  });

  it('rejects scan period outside API bounds', async () => {
    const fixture = await renderLoadedForm();

    const periodControl =
      fixture.componentInstance['form'].controls.scanPeriodDays;

    periodControl.setValue(400);
    periodControl.markAsDirty();
    periodControl.updateValueAndValidity();

    expect(periodControl.invalid).toBe(true);

    const saveButton = fixture.debugElement.query(
      By.css('[data-testid="save-settings"]'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton.componentInstance.disabled).toBe(true);
  });

  it('rejects gmail scan labels longer than 100 characters', async () => {
    const fixture = await renderLoadedForm();

    const labelControl =
      fixture.componentInstance['form'].controls.gmailScanLabel;

    labelControl.setValue('a'.repeat(101));
    labelControl.markAsDirty();
    labelControl.updateValueAndValidity();

    expect(labelControl.invalid).toBe(true);

    const saveButton = fixture.debugElement.query(
      By.css('[data-testid="save-settings"]'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton.componentInstance.disabled).toBe(true);
  });

  it('opens the clear parcel data dialog from the danger zone', async () => {
    const fixture = await renderLoadedForm();
    const openButton = fixture.debugElement.query(
      By.css('[data-testid="open-clear-parcel-data"]'),
    );

    openButton.triggerEventHandler('onClick');

    expect(
      fixture.componentInstance['clearDialogVisible'](),
    ).toBe(true);
  });

  it('clears parcel data once and closes the dialog on success', async () => {
    const fixture = await renderLoadedForm();
    const component = fixture.componentInstance;
    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    component['clearDialogVisible'].set(true);

    await component['onClearParcelData']();

    expect(clearParcelDataMock).toHaveBeenCalledTimes(1);
    expect(component['clearDialogVisible']()).toBe(false);
    expect(addSpy).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Parcel data deleted',
      life: 3000,
    });
  });

  it('keeps the dialog open after failure and allows retry', async () => {
    clearParcelDataMock
      .mockRejectedValueOnce(new Error('request failed'))
      .mockResolvedValueOnce({
        deletedParcelEmails: 0,
        deletedStatusEvents: 0,
        deletedParcels: 0,
        deletedGmailMessages: 0,
      });
    const fixture = await renderLoadedForm();
    const component = fixture.componentInstance;
    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    component['clearDialogVisible'].set(true);

    await component['onClearParcelData']();

    expect(component['clearDialogVisible']()).toBe(true);
    expect(addSpy).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'Failed to delete parcel data',
      life: 3000,
    });

    await component['onClearParcelData']();

    expect(clearParcelDataMock).toHaveBeenCalledTimes(2);
    expect(component['clearDialogVisible']()).toBe(false);
  });
});
