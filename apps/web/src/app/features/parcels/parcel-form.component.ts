import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  inject,
  Input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { AuthService } from '../../core/auth/auth.service';
import { ParcelsService } from '../../core/parcels/parcels.service';
import { previewGeneratedTrackingUrl } from '../../core/parcels/preview-generated-tracking-url';
import { parseOrderDate } from '../../core/parcels/order-date.pipe';
import {
  PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH,
  PARCEL_DESCRIPTION_MAX_LENGTH,
  PARCEL_STORE_MAX_LENGTH,
} from '../../core/parcels/parcel-field-limits';
import type {
  CreateParcelPayload,
  ParcelCarrier,
  ParcelDto,
  UpdateParcelPayload,
} from '../../core/parcels/parcels.types';

type FormFieldName =
  | 'store'
  | 'carrier'
  | 'customCarrierLabel'
  | 'trackingNumber'
  | 'orderDate'
  | 'description'
  | 'trackingUrl';

const CARRIER_OPTIONS: { label: string; value: ParcelCarrier }[] = [
  { label: 'InPost', value: 'INPOST' },
  { label: 'Poczta Polska', value: 'POCZTA_POLSKA' },
  { label: 'DPD', value: 'DPD' },
  { label: 'DHL', value: 'DHL' },
  { label: 'Custom', value: 'CUSTOM' },
];

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-parcel-form',
  imports: [
    ReactiveFormsModule,
    CardModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    ButtonModule,
    MessageModule,
  ],
  templateUrl: './parcel-form.component.html',
  styleUrl: './parcel-form.component.scss',
})
export class ParcelFormComponent implements OnInit {
  @Input({ required: true }) mode!: 'create' | 'edit';
  @Input() parcelId?: string;
  @Input({ required: true }) returnPath!: '/active' | '/archive';

  private readonly parcelsService = inject(ParcelsService);
  private readonly authService = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly carrierOptions = CARRIER_OPTIONS;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly authRequired = signal(false);
  protected readonly resolvedTrackingUrl = signal<string | null>(null);

  private savedSnapshot: ParcelDto | null = null;

  protected readonly form = this.fb.nonNullable.group({
    store: ['', [Validators.required, Validators.maxLength(PARCEL_STORE_MAX_LENGTH)]],
    carrier: ['INPOST' as ParcelCarrier, [Validators.required]],
    customCarrierLabel: ['', [Validators.maxLength(PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH)]],
    trackingNumber: ['', [Validators.required]],
    orderDate: [new Date(), [Validators.required]],
    description: ['', [Validators.maxLength(PARCEL_DESCRIPTION_MAX_LENGTH)]],
    trackingUrl: [''],
  });

  ngOnInit(): void {
    this.form.controls.carrier.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((carrier) => this.updateCustomLabelValidators(carrier));

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateGeneratedUrlPreview());

    if (this.mode === 'create') {
      this.loading.set(false);
      this.updateCustomLabelValidators(this.form.controls.carrier.value);
      this.updateGeneratedUrlPreview();
      return;
    }

    void this.loadParcel();
  }

  protected pageTitle(): string {
    return this.mode === 'create' ? 'Add parcel' : 'Edit parcel';
  }

  protected showCustomCarrierLabel(): boolean {
    return this.form.controls.carrier.value === 'CUSTOM';
  }

  protected canSave(): boolean {
    if (this.loading() || this.saving() || this.form.invalid) {
      return false;
    }

    return this.mode === 'create' || this.buildPatch() !== null;
  }

  protected showFieldError(controlName: FormFieldName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected fieldErrorMessage(controlName: FormFieldName): string | null {
    const control = this.form.controls[controlName];
    const errors = control.errors;

    if (!errors) {
      return null;
    }

    if (errors['server']) {
      return String(errors['server']);
    }

    if (errors['required']) {
      if (controlName === 'store') {
        return 'Store is required';
      }
      if (controlName === 'carrier') {
        return 'Carrier is required';
      }
      if (controlName === 'trackingNumber') {
        return 'Tracking number is required';
      }
      if (controlName === 'orderDate') {
        return 'Order date is required';
      }
      if (controlName === 'customCarrierLabel') {
        return 'Custom carrier label is required';
      }
    }

    if (errors['maxlength']) {
      if (controlName === 'store') {
        return `Store must be at most ${PARCEL_STORE_MAX_LENGTH} characters`;
      }
      if (controlName === 'description') {
        return `Description must be at most ${PARCEL_DESCRIPTION_MAX_LENGTH} characters`;
      }
      if (controlName === 'customCarrierLabel') {
        return `Custom carrier label must be at most ${PARCEL_CUSTOM_CARRIER_LABEL_MAX_LENGTH} characters`;
      }
    }

    return 'Invalid value';
  }

  protected onCancel(): void {
    void this.router.navigate([this.returnPath]);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.authRequired.set(false);
    this.clearServerErrors();

    try {
      if (this.mode === 'create') {
        await this.parcelsService.createParcel(this.buildCreatePayload());
        this.messages.add({
          severity: 'success',
          summary: 'Parcel added',
          life: 3000,
        });
      } else {
        const patch = this.buildPatch();
        if (!patch || !this.parcelId) {
          return;
        }

        await this.parcelsService.updateParcel(this.parcelId, patch);
        this.messages.add({
          severity: 'success',
          summary: 'Parcel updated',
          life: 3000,
        });
      }

      void this.router.navigate([this.returnPath]);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.authRequired.set(true);
        this.messages.add({
          severity: 'warn',
          summary: 'Session expired',
          detail: 'Sign in with Google again to continue.',
          life: 8000,
        });
        return;
      }

      if (err instanceof HttpErrorResponse && this.applyServerErrors(err)) {
        return;
      }

      this.messages.add({
        severity: 'error',
        summary:
          this.mode === 'create' ? 'Failed to add parcel' : 'Failed to update parcel',
        life: 4000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected onReLogin(): void {
    this.authService.signIn();
  }

  private async loadParcel(): Promise<void> {
    if (!this.parcelId) {
      this.loadError.set('Parcel not found.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const parcel = await this.parcelsService.getParcel(this.parcelId);
      this.applySnapshot(parcel);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.authRequired.set(true);
        this.loadError.set('Session expired. Sign in again to edit this parcel.');
      } else if (err instanceof HttpErrorResponse && err.status === 404) {
        this.loadError.set('Parcel not found.');
      } else {
        this.loadError.set('Failed to load parcel.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  private applySnapshot(parcel: ParcelDto): void {
    this.savedSnapshot = parcel;
    this.form.reset({
      store: parcel.store ?? '',
      carrier: parcel.carrier,
      customCarrierLabel: parcel.customCarrierLabel ?? '',
      trackingNumber: parcel.trackingNumber ?? '',
      orderDate: parseOrderDate(parcel.orderDate),
      description: parcel.description ?? '',
      trackingUrl: parcel.trackingUrlOverride ?? '',
    });
    this.updateCustomLabelValidators(parcel.carrier);
    this.updateGeneratedUrlPreview();
  }

  private updateGeneratedUrlPreview(): void {
    const { carrier, trackingNumber } = this.form.getRawValue();
    this.resolvedTrackingUrl.set(
      previewGeneratedTrackingUrl(carrier, trackingNumber),
    );
  }

  private buildCreatePayload(): CreateParcelPayload {
    const value = this.form.getRawValue();
    const payload: CreateParcelPayload = {
      store: value.store.trim(),
      carrier: value.carrier,
      trackingNumber: value.trackingNumber.trim(),
      orderDate: formatLocalDate(value.orderDate),
    };

    const description = value.description.trim();
    if (description.length > 0) {
      payload.description = description;
    }

    const trackingUrl = value.trackingUrl.trim();
    if (trackingUrl.length > 0) {
      payload.trackingUrl = trackingUrl;
    }

    if (value.carrier === 'CUSTOM') {
      payload.customCarrierLabel = value.customCarrierLabel.trim();
    }

    return payload;
  }

  private buildPatch(): UpdateParcelPayload | null {
    if (!this.savedSnapshot) {
      return null;
    }

    const value = this.form.getRawValue();
    const patch: UpdateParcelPayload = {};
    const store = value.store.trim();

    if (store !== (this.savedSnapshot.store ?? '')) {
      patch.store = store;
    }

    const description = value.description.trim();
    if (description !== (this.savedSnapshot.description ?? '')) {
      patch.description = description;
    }

    if (value.carrier !== this.savedSnapshot.carrier) {
      patch.carrier = value.carrier;
    }

    const customLabel = value.customCarrierLabel.trim();
    const savedLabel = this.savedSnapshot.customCarrierLabel ?? '';
    if (customLabel !== savedLabel) {
      patch.customCarrierLabel = customLabel;
    }

    const trackingNumber = value.trackingNumber.trim();
    if (trackingNumber !== (this.savedSnapshot.trackingNumber ?? '')) {
      patch.trackingNumber = trackingNumber;
    }

    const orderDate = formatLocalDate(value.orderDate);
    if (orderDate !== this.savedSnapshot.orderDate) {
      patch.orderDate = orderDate;
    }

    const trackingUrl = value.trackingUrl.trim();
    const savedOverride = this.savedSnapshot.trackingUrlOverride ?? '';
    if (trackingUrl !== savedOverride) {
      patch.trackingUrl = trackingUrl;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  private updateCustomLabelValidators(carrier: ParcelCarrier): void {
    const control = this.form.controls.customCarrierLabel;

    if (carrier === 'CUSTOM') {
      control.setValidators([Validators.required]);
    } else {
      control.clearValidators();
      if (control.value !== '') {
        control.setValue('');
      }
    }

    control.updateValueAndValidity();
  }

  private clearServerErrors(): void {
    for (const control of Object.values(this.form.controls)) {
      if (!control.errors?.['server']) {
        continue;
      }

      const rest = { ...control.errors };
      delete rest['server'];
      control.setErrors(Object.keys(rest).length > 0 ? rest : null);
    }
  }

  private applyServerErrors(err: HttpErrorResponse): boolean {
    const body = err.error as { errors?: { field?: string; message: string }[] };
    const errors = body?.errors;

    if (!Array.isArray(errors)) {
      return false;
    }

    const fieldNames = new Set<FormFieldName>([
      'store',
      'carrier',
      'customCarrierLabel',
      'trackingNumber',
      'orderDate',
      'description',
      'trackingUrl',
    ]);

    let applied = false;

    for (const item of errors) {
      if (item.field && fieldNames.has(item.field as FormFieldName)) {
        this.form.controls[item.field as FormFieldName].setErrors({
          server: item.message,
        });
        applied = true;
      }
    }

    return applied;
  }
}
