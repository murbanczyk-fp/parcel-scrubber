import type { EffectiveUserSettings } from '../user-settings';

export type SettingsFieldError = {
  field?: keyof EffectiveUserSettings;
  message: string;
};

export class SettingsValidationError extends Error {
  readonly errors: SettingsFieldError[];

  constructor(errors: SettingsFieldError[]) {
    super('Settings validation failed');
    this.name = 'SettingsValidationError';
    this.errors = errors;
  }
}
