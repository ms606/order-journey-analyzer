import { firstPart } from './attribution';
import { redactEmails } from './privacy';

export const GROUP = {
  none: 'No entry page',
  home: 'Homepage',
  product: 'Product page',
  shop: 'Shop',
  cart: 'Cart, checkout, or account',
  meaning: 'Meaning pages',
  other: 'Articles or other',
} as const;

/** Canonical display order for the default groups. Custom groups follow, A to Z. */
export const GROUP_ORDER: readonly string[] = [
  GROUP.none,
  GROUP.home,
  GROUP.product,
  GROUP.shop,
  GROUP.cart,
  GROUP.meaning,
  GROUP.other,
];

/** `exact_segment` compares the first URL segment. `ends_with` compares the last URL segment. */
export type MatchType = 'exact_segment' | 'ends_with';

export const MATCH_TYPES: readonly MatchType[] = ['exact_segment', 'ends_with'];

export const MATCH_TYPE_LABEL: Readonly<Record<MatchType, string>> = {
  exact_segment: 'First part is',
  ends_with: 'Last part ends with',
};

export interface EntryRule {
  /** Lower numbers run first. */
  priority: number;
  matchType: MatchType;
  value: string;
  group: string;
}

/**
 * Editable rules, in run order. Blank URLs, the homepage and the final fallback are fixed:
 * they are handled in `entryGroupFor` and are not rules.
 */
export const DEFAULT_ENTRY_RULES: readonly EntryRule[] = [
  { priority: 10, matchType: 'exact_segment', value: 'product', group: GROUP.product },
  { priority: 20, matchType: 'exact_segment', value: 'shop', group: GROUP.shop },
  { priority: 30, matchType: 'exact_segment', value: 'stones', group: GROUP.shop },
  { priority: 40, matchType: 'exact_segment', value: 'chakra', group: GROUP.shop },
  { priority: 50, matchType: 'exact_segment', value: 'crystal-type', group: GROUP.shop },
  { priority: 60, matchType: 'exact_segment', value: 'category', group: GROUP.shop },
  { priority: 70, matchType: 'exact_segment', value: 'cart', group: GROUP.cart },
  { priority: 80, matchType: 'exact_segment', value: 'checkout', group: GROUP.cart },
  { priority: 90, matchType: 'exact_segment', value: 'my-account', group: GROUP.cart },
  { priority: 100, matchType: 'ends_with', value: '-meaning', group: GROUP.meaning },
];

export type EntryKind = 'blank' | 'home' | 'page' | 'unreadable';

export interface EntryInfo {
  kind: EntryKind;
  /** Lowercased path without query string, fragment or trailing slash. `/` for the homepage. */
  path: string | null;
  /** First path segment, lowercased. */
  segment: string | null;
  /** Last path segment, lowercased. The same as `segment` for a one-segment path. */
  lastSegment: string | null;
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
  if (!value) return { kind: 'blank', path: null, segment: null, lastSegment: null, productSlug: null };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    try {
      url = new URL(value, PLACEHOLDER_BASE);
    } catch {
      return { kind: 'unreadable', path: null, segment: null, lastSegment: null, productSlug: null };
    }
  }
  const segments = url.pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => redactEmails(safeDecode(s)).toLowerCase());
  if (segments.length === 0) return { kind: 'home', path: '/', segment: null, lastSegment: null, productSlug: null };
  const segment = segments[0] ?? null;
  const lastSegment = segments[segments.length - 1] ?? null;
  const productSlug = segment === 'product' && segments[1] ? segments[1] : null;
  return { kind: 'page', path: `/${segments.join('/')}`, segment, lastSegment, productSlug };
}

/** Normalizes a rule value typed by a user: trims, lowercases, removes slashes around it. */
export function normalizeRuleValue(input: string): string {
  return input.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

/** Rules in run order: lowest priority number first. Equal numbers keep their list order. */
export function sortRules(rules: readonly EntryRule[]): EntryRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

function ruleKey(r: EntryRule): string {
  return `${r.matchType}:${normalizeRuleValue(r.value)}`;
}

/**
 * The rules that can apply, normalized and in run order. A blank value, or a repeat of an
 * earlier rule with the same match type and value, can never apply, so it is left out.
 */
export function activeRules(rules: readonly EntryRule[]): EntryRule[] {
  const seen = new Set<string>();
  const active: EntryRule[] = [];
  for (const r of sortRules(rules)) {
    const value = normalizeRuleValue(r.value);
    const key = ruleKey(r);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    active.push({ ...r, value, group: r.group.trim() || GROUP.other });
  }
  return active;
}

function ruleMatches(rule: EntryRule, info: EntryInfo): boolean {
  if (rule.matchType === 'exact_segment') return info.segment === rule.value;
  return info.lastSegment !== null && info.lastSegment.endsWith(rule.value);
}

/**
 * The group for one entry page. Blank URLs and the homepage are fixed and come first, then the
 * first matching rule, then the fixed fallback. Pass the output of `activeRules`.
 */
export function entryGroupFor(info: EntryInfo, active: readonly EntryRule[]): string {
  switch (info.kind) {
    case 'blank':
      return GROUP.none;
    case 'home':
      return GROUP.home;
    case 'unreadable':
      return GROUP.other;
    case 'page':
      return active.find((r) => ruleMatches(r, info))?.group ?? GROUP.other;
  }
}

export function endsWithMeaning(info: EntryInfo): boolean {
  return info.lastSegment !== null && info.lastSegment.endsWith('-meaning');
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

/** The priority for a new rule: the next round number after the last rule, so it runs last. */
export function nextPriority(rules: readonly EntryRule[]): number {
  const highest = rules.reduce((max, r) => Math.max(max, r.priority), 0);
  return (Math.floor(highest / 10) + 1) * 10;
}

/** A priority typed by a user: a whole number from 0 up, or null if it is anything else. */
export function parsePriority(text: string): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Sets the group for one first URL segment: updates the rule for that segment,
 * or adds a new rule that runs last.
 */
export function setSegmentGroup(rules: readonly EntryRule[], segment: string, group: string): EntryRule[] {
  const value = normalizeRuleValue(segment);
  if (!value) return [...rules];
  const i = rules.findIndex((r) => r.matchType === 'exact_segment' && normalizeRuleValue(r.value) === value);
  if (i === -1) return [...rules, { priority: nextPriority(rules), matchType: 'exact_segment', value, group }];
  return rules.map((r, j) => (j === i ? { ...r, group } : r));
}

/** Indexes of rules that are blank or repeat an earlier rule in run order (these are ignored). */
export function ignoredRuleIndexes(rules: readonly EntryRule[]): Set<number> {
  const seen = new Set<string>();
  const ignored = new Set<number>();
  const byRunOrder = rules.map((rule, index) => ({ rule, index })).sort((a, b) => a.rule.priority - b.rule.priority);
  for (const { rule, index } of byRunOrder) {
    const key = ruleKey(rule);
    if (!normalizeRuleValue(rule.value) || seen.has(key)) ignored.add(index);
    else seen.add(key);
  }
  return ignored;
}
