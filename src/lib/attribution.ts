/** Helpers for the `_wc_order_attribution_*` columns. */

export const NOT_RECORDED = 'Not recorded';

/** Repeated values are joined by "|". The first part is always the one used. */
export function firstPart(raw: string | undefined | null): string {
  if (raw == null) return '';
  const i = raw.indexOf('|');
  return (i === -1 ? raw : raw.slice(0, i)).trim();
}

export interface RepeatInfo {
  repeated: boolean;
  differs: boolean;
}

/** Whether a cell holds repeated values (`a|b`) and whether those parts differ. */
export function repeatInfo(raw: string | undefined | null): RepeatInfo {
  if (raw == null || !raw.includes('|')) return { repeated: false, differs: false };
  const parts = raw.split('|').map((p) => p.trim());
  const head = parts[0];
  return { repeated: true, differs: parts.some((p) => p !== head) };
}

/** Whole, non-negative number from the first part of a cell, or null if blank or not a whole number. */
export function parseCount(raw: string | undefined | null): number | null {
  const v = firstPart(raw);
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  typein: 'Direct',
  organic: 'Organic search',
  referral: 'Referral',
  utm: 'Campaign link',
  admin: 'Created by shop staff',
  mobile_app: 'Mobile app',
  unknown: 'Unknown',
};

/** Display label for a source type value. `typein` is shown as "Direct". */
export function sourceTypeLabel(value: string): string {
  if (!value) return NOT_RECORDED;
  return SOURCE_TYPE_LABELS[value] ?? value;
}

/** Display label for a `utm_source` value. Values are matched exactly, never grouped. */
export function sourceLabel(value: string): string {
  return value || NOT_RECORDED;
}

export function deviceTypeLabel(value: string): string {
  return value || NOT_RECORDED;
}

export type DeviceName = 'iPhone' | 'iPad' | 'Android' | 'Mac' | 'Windows' | 'Other';

export const DEVICE_NAMES: readonly DeviceName[] = ['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Other'];

/**
 * Device name from a user agent string. Checked in this order:
 * iPhone, iPad, Android, Macintosh (shown as Mac), Windows, otherwise Other.
 */
export function deviceNameFromUserAgent(userAgent: string): DeviceName {
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Macintosh')) return 'Mac';
  if (userAgent.includes('Windows')) return 'Windows';
  return 'Other';
}
