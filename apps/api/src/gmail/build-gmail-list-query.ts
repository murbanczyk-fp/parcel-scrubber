function formatLabelForGmailQuery(labelName: string): string {
  if (/\s/.test(labelName)) {
    const escaped = labelName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `label:"${escaped}"`;
  }

  return `label:${labelName}`;
}

export function buildGmailListQuery(
  labelName: string,
  scanPeriodDays: number,
): string {
  return `${formatLabelForGmailQuery(labelName)} newer_than:${scanPeriodDays}d`;
}
