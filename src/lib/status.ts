export const KNOWN_STATUSES = ['wc-completed', 'wc-processing', 'wc-refunded', 'wc-failed', 'wc-cancelled'] as const;

/** Statuses left out by default. Everything else, including unknown statuses, counts. */
export const DEFAULT_EXCLUDED_STATUSES: readonly string[] = ['wc-failed', 'wc-cancelled'];

const STATUS_LABELS: Readonly<Record<string, string>> = {
  'wc-completed': 'Completed',
  'wc-processing': 'Processing',
  'wc-refunded': 'Refunded',
  'wc-failed': 'Failed',
  'wc-cancelled': 'Cancelled',
};

export function isKnownStatus(status: string): boolean {
  return Object.hasOwn(STATUS_LABELS, status);
}

export function statusLabel(status: string): string {
  if (!status) return 'No status';
  return STATUS_LABELS[status] ?? status;
}

export function defaultIncludedStatuses(statuses: Iterable<string>): string[] {
  return [...new Set(statuses)].filter((s) => !DEFAULT_EXCLUDED_STATUSES.includes(s));
}

/** Known statuses first in their usual order, then any others by name. */
export function sortStatuses(statuses: Iterable<string>): string[] {
  return [...new Set(statuses)].sort((a, b) => {
    const ia = (KNOWN_STATUSES as readonly string[]).indexOf(a);
    const ib = (KNOWN_STATUSES as readonly string[]).indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}
