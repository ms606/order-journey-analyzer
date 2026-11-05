import { firstPart } from './attribution';
import { redactEmails } from './privacy';

export const GROUP = {
  none: 'No entry page',
  home: 'Homepage',
  product: 'Product page',
  shop: 'Shop',
  cart: 'Cart, checkout, or account',
  other: 'Articles or other',
} as const;

/** Canonical display order for the default groups. Custom groups follow, A to Z. */
export const GROUP_ORDER: readonly string[] = [
  GROUP.none,
  GROUP.home,
  GROUP.product,
  GROUP.shop,
  GROUP.cart,
  GROUP.other,
];

export interface EntryRule {
  segment: string;
  group: string;
}

export const DEFAULT_ENTRY_RULES: readonly EntryRule[] = [
  { segment: 'product', group: GROUP.product },
  { segment: 'shop', group: GROUP.shop },
  { segment: 'stones', group: GROUP.shop },
  { segment: 'chakra', group: GROUP.shop },
  { segment: 'crystal-type', group: GROUP.shop },
  { segment: 'category', group: GROUP.shop },
  { segment: 'cart', group: GROUP.cart },
  { segment: 'checkout', group: GROUP.cart },
  { segment: 'my-account', group: GROUP.cart },
];

export type EntryKind = 'blank' | 'home' | 'page' | 'unreadable';

export interface EntryInfo {
  kind: EntryKind;
  /** Lowercased path without query string, fragment or trailing slash. `/` for the homepage. */
  path: string | null;
  /** First path segment, lowercased. */
  segment: string | null;
  /** For `/product/<slug>/` pages: the slug. */
  productSlug: string | null;
}

const PLACEHOLDER_BASE = 'https://entry.invalid';

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Reads the entry page URL with `new URL()`. Keeps the path only:
 * query strings, fragments, case, and trailing slashes are ignored.
 */
export function parseEntry(raw: string | null | undefined): EntryInfo {
  const value = firstPart(raw);
  if (!value) return { kind: 'blank', path: null, segment: null, productSlug: null };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    try {
      url = new URL(value, PLACEHOLDER_BASE);
    } catch {
      return { kind: 'unreadable', path: null, segment: null, productSlug: null };
    }
  }
  const segments = url.pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => redactEmails(safeDecode(s)).toLowerCase());
  if (segments.length === 0) return { kind: 'home', path: '/', segment: null, productSlug: null };
  const segment = segments[0] ?? null;
  const productSlug = segment === 'product' && segments[1] ? segments[1] : null;
  return { kind: 'page', path: `/${segments.join('/')}`, segment, productSlug };
}

/** Normalizes a segment typed by a user: trims, lowercases, removes slashes around it. */
export function normalizeSegment(input: string): string {
  return input.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

export type RuleMap = ReadonlyMap<string, string>;

/** The first rule for a segment wins. */
export function buildRuleMap(rules: readonly EntryRule[]): RuleMap {
  const map = new Map<string, string>();
  for (const r of rules) {
    const seg = normalizeSegment(r.segment);
    if (seg && !map.has(seg)) map.set(seg, r.group.trim() || GROUP.other);
  }
  return map;
}

export function entryGroupFor(info: EntryInfo, rules: RuleMap): string {
  switch (info.kind) {
    case 'blank':
      return GROUP.none;
    case 'home':
      return GROUP.home;
    case 'unreadable':
      return GROUP.other;
    case 'page':
      return (info.segment !== null ? rules.get(info.segment) : undefined) ?? GROUP.other;
  }
}

export function endsWithMeaning(info: EntryInfo): boolean {
  return info.path !== null && info.path.endsWith('-meaning');
}

/** Sorts group names: default groups in their usual order, then custom ones A to Z. */
export function sortGroups(groups: Iterable<string>): string[] {
  const unique = [...new Set(groups)];
  return unique.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/** All group names a rule set can produce. */
export function groupsForRules(rules: readonly EntryRule[]): string[] {
  return sortGroups([...GROUP_ORDER, ...rules.map((r) => r.group.trim()).filter(Boolean)]);
}

/**
 * Sets the group for one segment: updates the first rule for that segment,
 * or adds a new rule at the end.
 */
export function setSegmentGroup(rules: readonly EntryRule[], segment: string, group: string): EntryRule[] {
  const seg = normalizeSegment(segment);
  if (!seg) return [...rules];
  const i = rules.findIndex((r) => normalizeSegment(r.segment) === seg);
  if (i === -1) return [...rules, { segment: seg, group }];
  return rules.map((r, j) => (j === i ? { ...r, group } : r));
}

/** Indexes of rules whose segment is blank or already used by an earlier rule (these are ignored). */
export function ignoredRuleIndexes(rules: readonly EntryRule[]): Set<number> {
  const seen = new Set<string>();
  const ignored = new Set<number>();
  rules.forEach((r, i) => {
    const seg = normalizeSegment(r.segment);
    if (!seg || seen.has(seg)) ignored.add(i);
    else seen.add(seg);
  });
  return ignored;
}
