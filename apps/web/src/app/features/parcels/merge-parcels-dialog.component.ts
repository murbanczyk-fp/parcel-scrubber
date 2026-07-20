import {
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';

import type {
  MergeParcelsPayload,
  ParcelDto,
} from '../../core/parcels/parcels.types';
import {
  buildCarrierConflict,
  buildTextFieldConflicts,
  type CarrierChoice,
  type CarrierConflict,
  type FieldChoice,
  isMergeFormComplete,
  MERGE_FIELD_LABELS,
  type NullableMergeField,
  previewOrderDate,
  resolveMergeFields,
  type TextFieldConflict,
} from './merge-field-options';

const EMPTY_KEY = '__empty__';
const OTHER_KEY = '__other__';

@Component({
  selector: 'app-merge-parcels-dialog',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    RadioButtonModule,
    InputTextModule,
  ],
  templateUrl: './merge-parcels-dialog.component.html',
  styleUrl: './merge-parcels-dialog.component.scss',
})
export class MergeParcelsDialogComponent {
  readonly parcels = input.required<ParcelDto[]>();
  readonly visible = input(false);
  readonly submitting = input(false);

  readonly visibleChange = output<boolean>();
  readonly confirmed = output<MergeParcelsPayload>();

  protected readonly emptyKey = EMPTY_KEY;
  protected readonly otherKey = OTHER_KEY;
  protected readonly textConflicts = signal<TextFieldConflict[]>([]);
  protected readonly carrierConflict = signal<CarrierConflict | null>(null);
  protected readonly orderDatePreview = signal('');
  protected readonly textSelection = signal<
    Partial<Record<NullableMergeField, string>>
  >({});
  protected readonly otherText = signal<
    Partial<Record<NullableMergeField, string>>
  >({});
  protected readonly carrierSelection = signal<string | null>(null);
  protected readonly otherCarrierLabel = signal('');
  protected readonly fieldLabels = MERGE_FIELD_LABELS;

  constructor() {
    effect(() => {
      const selected = this.parcels();
      if (!this.visible() || selected.length < 2) {
        return;
      }

      this.textConflicts.set(buildTextFieldConflicts(selected));
      this.carrierConflict.set(buildCarrierConflict(selected));
      this.orderDatePreview.set(previewOrderDate(selected));
      this.textSelection.set({});
      this.otherText.set({});
      this.carrierSelection.set(null);
      this.otherCarrierLabel.set('');
    });
  }

  protected canConfirm(): boolean {
    return (
      isMergeFormComplete({
        textConflicts: this.textConflicts(),
        textChoices: this.toTextChoices(),
        otherText: this.otherText(),
        carrierConflict: this.carrierConflict(),
        carrierChoice: this.toCarrierChoice(),
        otherCarrierLabel: this.otherCarrierLabel(),
      }) && !this.submitting()
    );
  }

  protected textModel(field: NullableMergeField): string | null {
    return this.textSelection()[field] ?? null;
  }

  protected setTextModel(field: NullableMergeField, value: string): void {
    this.textSelection.update((current) => ({ ...current, [field]: value }));
  }

  protected onOtherText(field: NullableMergeField, value: string): void {
    this.otherText.update((current) => ({ ...current, [field]: value }));
    this.setTextModel(field, OTHER_KEY);
  }

  protected carrierOptionKey(
    option: CarrierConflict['options'][number],
  ): string {
    return `${option.carrier}\0${option.customCarrierLabel ?? ''}`;
  }

  protected onOtherCarrierLabel(value: string): void {
    this.otherCarrierLabel.set(value);
    this.carrierSelection.set(OTHER_KEY);
  }

  protected onVisibleChange(next: boolean): void {
    this.visibleChange.emit(next);
  }

  protected onCancel(): void {
    this.visibleChange.emit(false);
  }

  protected onConfirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    const selected = this.parcels();
    const fields = resolveMergeFields({
      parcels: selected,
      textConflicts: this.textConflicts(),
      textChoices: this.toTextChoices(),
      otherText: this.otherText(),
      carrierConflict: this.carrierConflict(),
      carrierChoice: this.toCarrierChoice(),
      otherCarrierLabel: this.otherCarrierLabel(),
    });

    this.confirmed.emit({
      parcelIds: selected.map((parcel) => parcel.id),
      fields,
    });
  }

  private toTextChoices(): Partial<Record<NullableMergeField, FieldChoice>> {
    const choices: Partial<Record<NullableMergeField, FieldChoice>> = {};
    for (const [field, key] of Object.entries(this.textSelection()) as [
      NullableMergeField,
      string,
    ][]) {
      if (key === EMPTY_KEY) {
        choices[field] = { kind: 'empty' };
      } else if (key === OTHER_KEY) {
        choices[field] = { kind: 'other' };
      } else {
        choices[field] = { kind: 'value', value: key };
      }
    }
    return choices;
  }

  private toCarrierChoice(): CarrierChoice | null {
    const key = this.carrierSelection();
    if (key == null) {
      return null;
    }
    if (key === OTHER_KEY) {
      return { kind: 'other' };
    }

    const option = this.carrierConflict()?.options.find(
      (entry) => this.carrierOptionKey(entry) === key,
    );
    if (!option) {
      return null;
    }

    return {
      kind: 'value',
      carrier: option.carrier,
      customCarrierLabel: option.customCarrierLabel,
    };
  }
}
