export const SCAN_PERIOD_DAYS_MIN = 1;
export const SCAN_PERIOD_DAYS_MAX = 365;

export function validateScanPeriodDays(raw: number): number {
  if (!Number.isInteger(raw)) {
    throw new Error('Scan period days must be an integer');
  }

  if (raw < SCAN_PERIOD_DAYS_MIN || raw > SCAN_PERIOD_DAYS_MAX) {
    throw new Error(
      `Scan period days must be between ${SCAN_PERIOD_DAYS_MIN} and ${SCAN_PERIOD_DAYS_MAX}`,
    );
  }

  return raw;
}
