import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { MessageModule } from 'primeng/message';

import { SettingsService } from '../../core/settings/settings.service';
import {
  EffectiveUserSettings,
  PatchUserSettings,
} from '../../core/settings/settings.types';

function integerValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;

  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Number.isInteger(Number(value)) ? null : { integer: true };
}

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    CardModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    MessageModule,
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);

  private savedSnapshot: EffectiveUserSettings | null = null;

  protected readonly form = this.fb.nonNullable.group({
    gmailScanLabel: ['', [Validators.required, Validators.maxLength(100)]],
    scanPeriodDays: [
      30,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(365),
        integerValidator,
      ],
    ],
  });

  ngOnInit(): void {
    void this.loadSettings();
  }

  protected canSave(): boolean {
    if (this.loading() || this.saving() || this.form.invalid) {
      return false;
    }

    return this.buildPatch() !== null;
  }

  protected showFieldError(controlName: keyof EffectiveUserSettings): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected fieldErrorMessage(
    controlName: keyof EffectiveUserSettings,
  ): string | null {
    const control = this.form.controls[controlName];
    const errors = control.errors;

    if (!errors) {
      return null;
    }

    if (errors['server']) {
      return String(errors['server']);
    }

    if (errors['required']) {
      return controlName === 'gmailScanLabel'
        ? 'Gmail scan label is required'
        : 'Scan period is required';
    }

    if (errors['maxlength']) {
      return 'Gmail scan label must be at most 100 characters';
    }

    if (errors['min'] || errors['max']) {
      return 'Scan period must be between 1 and 365 days';
    }

    if (errors['integer']) {
      return 'Scan period must be a whole number';
    }

    return 'Invalid value';
  }

  protected async onSave(): Promise<void> {
    const patch = this.buildPatch();

    if (!patch) {
      return;
    }

    this.saving.set(true);
    this.clearServerErrors();

    try {
      const updated = await this.settingsService.save(patch);
      this.applySnapshot(updated);
      this.form.markAsPristine();
      this.messages.add({
        severity: 'success',
        summary: 'Settings saved',
        life: 3000,
      });
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.applyServerErrors(err);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async loadSettings(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      const settings = await this.settingsService.load();
      this.applySnapshot(settings);
    } catch {
      this.loadError.set('Failed to load settings.');
    } finally {
      this.loading.set(false);
    }
  }

  private applySnapshot(settings: EffectiveUserSettings): void {
    this.savedSnapshot = { ...settings };
    this.form.reset(settings);
  }

  private buildPatch(): PatchUserSettings | null {
    if (!this.savedSnapshot) {
      return null;
    }

    const patch: PatchUserSettings = {};
    const label = this.form.controls.gmailScanLabel.value.trim();
    const period = this.form.controls.scanPeriodDays.value;

    if (label !== this.savedSnapshot.gmailScanLabel) {
      patch.gmailScanLabel = label;
    }

    if (period !== this.savedSnapshot.scanPeriodDays) {
      patch.scanPeriodDays = period;
    }

    return Object.keys(patch).length > 0 ? patch : null;
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

  private applyServerErrors(err: HttpErrorResponse): void {
    const body = err.error as { errors?: { field?: string; message: string }[] };
    const errors = body?.errors;

    if (!Array.isArray(errors)) {
      return;
    }

    for (const item of errors) {
      if (
        item.field === 'gmailScanLabel' ||
        item.field === 'scanPeriodDays'
      ) {
        this.form.controls[item.field].setErrors({
          server: item.message,
        });
      }
    }
  }
}
