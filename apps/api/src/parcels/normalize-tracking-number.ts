export function normalizeTrackingNumber(
  raw: string | null | undefined,
): string | null {
  if (raw == null) {
    return null;
  }

  const normalized = raw.trim().replace(/\s+/g, '').toUpperCase();
  return normalized.length === 0 ? null : normalized;
}
