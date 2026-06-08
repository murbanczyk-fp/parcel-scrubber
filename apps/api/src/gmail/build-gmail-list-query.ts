export function buildGmailListQuery(
  labelName: string,
  scanPeriodDays: number,
): string {
  return `label:${labelName} newer_than:${scanPeriodDays}d`;
}
