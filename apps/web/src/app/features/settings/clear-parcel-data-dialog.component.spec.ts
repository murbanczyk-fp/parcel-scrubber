import { TestBed } from '@angular/core/testing';

import { ClearParcelDataDialogComponent } from './clear-parcel-data-dialog.component';

describe('ClearParcelDataDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClearParcelDataDialogComponent],
    }).compileComponents();
  });

  it('enables confirmation only for the exact DELETE phrase', () => {
    const fixture = TestBed.createComponent(ClearParcelDataDialogComponent);
    const component = fixture.componentInstance;

    for (const phrase of ['', 'delete', ' DELETE ', 'DELET']) {
      component['confirmationPhrase'].set(phrase);
      expect(component['canConfirm']()).toBe(false);
    }

    component['confirmationPhrase'].set('DELETE');
    expect(component['canConfirm']()).toBe(true);
  });

  it('emits confirmation once the exact phrase is entered', () => {
    const fixture = TestBed.createComponent(ClearParcelDataDialogComponent);
    const component = fixture.componentInstance;
    const confirmed = vi.fn();
    component.confirmed.subscribe(confirmed);

    component['onConfirm']();
    component['confirmationPhrase'].set('DELETE');
    component['onConfirm']();

    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('resets a previous phrase whenever the dialog opens', () => {
    const fixture = TestBed.createComponent(ClearParcelDataDialogComponent);
    const component = fixture.componentInstance;

    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    component['confirmationPhrase'].set('DELETE');

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    expect(component['confirmationPhrase']()).toBe('');
  });

  it('blocks confirmation, cancellation, and dismissal while submitting', () => {
    const fixture = TestBed.createComponent(ClearParcelDataDialogComponent);
    const component = fixture.componentInstance;
    const confirmed = vi.fn();
    const visibleChange = vi.fn();
    component.confirmed.subscribe(confirmed);
    component.visibleChange.subscribe(visibleChange);

    component['confirmationPhrase'].set('DELETE');
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    expect(component['canConfirm']()).toBe(false);
    component['onConfirm']();
    component['onCancel']();
    component['onVisibleChange'](false);

    expect(confirmed).not.toHaveBeenCalled();
    expect(visibleChange).not.toHaveBeenCalled();
  });
});
