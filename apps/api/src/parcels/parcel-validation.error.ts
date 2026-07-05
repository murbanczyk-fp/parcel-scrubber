export type ParcelFieldError = {
  field?: string;
  message: string;
};

export class ParcelValidationError extends Error {
  readonly errors: ParcelFieldError[];

  constructor(errors: ParcelFieldError[]) {
    super('Parcel validation failed');
    this.name = 'ParcelValidationError';
    this.errors = errors;
  }
}
