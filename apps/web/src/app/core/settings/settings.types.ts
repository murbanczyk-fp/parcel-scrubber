/** Validation bounds must stay aligned with API constants in `apps/api/src/user-settings/`. */
export type EffectiveUserSettings = {
  gmailScanLabel: string;
  scanPeriodDays: number;
};

export type SettingsValidationErrorResponse = {
  errors: { field?: keyof EffectiveUserSettings; message: string }[];
};

export type DeleteUserParcelDataResponse = {
  deletedParcelEmails: number;
  deletedStatusEvents: number;
  deletedParcels: number;
  deletedGmailMessages: number;
};

export type PatchUserSettings = Partial<EffectiveUserSettings>;
