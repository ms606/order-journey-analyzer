import { describe, expect, it } from 'vitest';
import {
  activeRules,
  DEFAULT_ENTRY_RULES,
  endsWithMeaning,
  entryGroupFor,
  GROUP,
  groupsForRules,
  ignoredRuleIndexes,
  nextPriority,
  normalizeRuleValue,
  parseEntry,
  parsePriority,
  setSegmentGroup,
  sortGroups,
  sortRules,
  type EntryRule,
} from './entry';

const defaults = activeRules(DEFAULT_ENTRY_RULES);
const groupOf = (url: string) => entryGroupFor(parseEntry(url), defaults);
const exact = (priority: number, value: string, group: string): EntryRule => ({ priority, matchType: 'exact_segment', value, group });
const endsWith = (priority: number, value: string, group: string): EntryRule => ({ priority, matchType: 'ends_with', value, group });
const groupWith = (rules: readonly EntryRule[], url: string) => entryGroupFor(parseEntry(url), activeRules(rules));

describe('parseEntry', () => {
  it('treats a blank value as no entry page', () => {
    expect(parseEntry('')).toEqual({ kind: 'blank', path: null, segment: null, lastSegment: null, productSlug: null });
    expect(parseEntry('   ')).toMatchObject({ kind: 'blank' });
    expect(groupOf('')).toBe(GROUP.none);
  });

  it('treats a URL with no path as the homepage, whatever the query or fragment', () => {
    for (const url of [
      'https://shop.example.test',
      'https://shop.example.test/',
      'https://shop.example.test/?utm_source=x',
      'https://shop.example.test/#top',
      'https://shop.example.test///',
    ]) {
      expect(parseEntry(url)).toMatchObject({ kind: 'home', path: '/' });
      expect(groupOf(url)).toBe(GROUP.home);
    }
  });

  it('keeps the path only, lowercased, without query, fragment or trailing slash', () => {
    expect(parseEntry('https://shop.example.test/Product/Rose-Quartz/?ref=abc#reviews')).toEqual({
      kind: 'page',
      path: '/product/rose-quartz',
      segment: 'product',
      lastSegment: 'rose-quartz',
      productSlug: 'rose-quartz',
    });
    expect(parseEntry('https://shop.example.test/shop///').path).toBe('/shop');
  });

  it('gives the first and last segment, which are the same for a one-segment path', () => {
    expect(parseEntry('https://a.test/blog/guides/Moon-Meaning/')).toMatchObject({ segment: 'blog', lastSegment: 'moon-meaning' });
    expect(parseEntry('https://a.test/about/')).toMatchObject({ segment: 'about', lastSegment: 'about' });
    expect(parseEntry('https://a.test/')).toMatchObject({ segment: null, lastSegment: null });
  });

  it('reads relative paths too', () => {
    expect(parseEntry('/stones/amethyst/')).toMatchObject({ segment: 'stones', path: '/stones/amethyst' });
  });

  it('uses the first of repeated values', () => {
    expect(parseEntry('https://a.test/cart/|https://a.test/shop/').segment).toBe('cart');
  });

  it('decodes encoded paths for display', () => {
    expect(parseEntry('https://a.test/blog/%C3%A4methyst-meaning/').path).toBe('/blog/ämethyst-meaning');
  });

  it('marks values new URL() cannot read as unreadable and groups them as Articles or other', () => {
    expect(parseEntry('http://').kind).toBe('unreadable');
    expect(parseEntry('https://[bad').kind).toBe('unreadable');
    expect(groupOf('http://')).toBe(GROUP.other);
  });

  it('never keeps an email address found in a path', () => {
    const info = parseEntry('https://a.test/my-account/person@example.com/');
    expect(info.path).not.toContain('@');
    expect(info.path).toBe('/my-account/[email removed]');
  });

  it('only gives a product slug for /product/<slug>/', () => {
    expect(parseEntry('https://a.test/product/').productSlug).toBeNull();
    expect(parseEntry('https://a.test/shop/rose-quartz/').productSlug).toBeNull();
  });
});

describe('default entry groups', () => {
  it.each([
    ['https://a.test/product/rose-quartz/', GROUP.product],
    ['https://a.test/shop/', GROUP.shop],
    ['https://a.test/stones/amethyst/', GROUP.shop],
    ['https://a.test/chakra/heart/', GROUP.shop],
    ['https://a.test/crystal-type/tumbled/', GROUP.shop],
    ['https://a.test/category/sale/', GROUP.shop],
    ['https://a.test/cart/', GROUP.cart],
    ['https://a.test/checkout/order-received/5/', GROUP.cart],
    ['https://a.test/my-account/', GROUP.cart],
    ['https://a.test/amethyst-meaning/', GROUP.meaning],
    ['https://a.test/blog/moonstone-meaning/', GROUP.meaning],
    ['https://a.test/blog/how-to-cleanse/', GROUP.other],
    ['https://a.test/SHOP/', GROUP.shop],
    ['https://a.test/products/x/', GROUP.other],
  ])('%s → %s', (url, group) => {
    expect(groupOf(url)).toBe(group);
  });
});

describe('Meaning pages', () => {
  it.each(['/x-meaning', '/x-meaning/', '/X-Meaning/?a=1'])('%s is a Meaning page', (url) => {
    expect(groupOf(url)).toBe(GROUP.meaning);
  });

  it('ignores case, trailing slashes, query strings and fragments on full URLs too', () => {
    for (const url of ['https://a.test/x-meaning#top', 'https://a.test/X-MEANING///', 'https://a.test/blog/X-Meaning/?a=1#top']) {
      expect(groupOf(url)).toBe(GROUP.meaning);
    }
  });

  it('compares the last URL segment only', () => {
    expect(groupOf('/x-meaning/more/')).toBe(GROUP.other);
    expect(groupOf('/x-meanings/')).toBe(GROUP.other);
    expect(groupOf('/meaning/')).toBe(GROUP.other);
    expect(groupOf('/x/?page=y-meaning')).toBe(GROUP.other);
    expect(groupOf('/x/#y-meaning')).toBe(GROUP.other);
  });

  it('lets a Product, Shop or Cart rule win over -meaning', () => {
    expect(groupOf('/product/x-meaning/')).toBe(GROUP.product);
    expect(groupOf('/Product/X-Meaning/?a=1')).toBe(GROUP.product);
    expect(groupOf('/shop/x-meaning/')).toBe(GROUP.shop);
    expect(groupOf('/stones/amethyst-meaning/')).toBe(GROUP.shop);
    expect(groupOf('/category/x/y-meaning/')).toBe(GROUP.shop);
    expect(groupOf('/cart/x-meaning/')).toBe(GROUP.cart);
  });

  it('keeps the fixed rules ahead of every editable rule', () => {
    const everything = [endsWith(1, '', 'Never'), exact(2, '', 'Never')];
    expect(groupWith(everything, '')).toBe(GROUP.none);
    expect(groupWith(everything, 'https://a.test/?x=-meaning')).toBe(GROUP.home);
    expect(groupWith([], '/anything/')).toBe(GROUP.other);
  });

  it('sends -meaning pages back to Articles or other when the rule is removed', () => {
    const without = DEFAULT_ENTRY_RULES.filter((r) => r.matchType !== 'ends_with');
    expect(groupWith(without, '/x-meaning/')).toBe(GROUP.other);
  });
});

describe('rule priority', () => {
  it('runs the lowest number first, whatever the list order', () => {
    const rules = [exact(20, 'blog', 'Blog'), endsWith(10, '-meaning', GROUP.meaning)];
    expect(groupWith(rules, '/blog/x-meaning/')).toBe(GROUP.meaning);
    expect(groupWith([...rules].reverse(), '/blog/x-meaning/')).toBe(GROUP.meaning);
  });

  it('changes the result when the priorities swap', () => {
    const rules = [exact(10, 'blog', 'Blog'), endsWith(20, '-meaning', GROUP.meaning)];
    expect(groupWith(rules, '/blog/x-meaning/')).toBe('Blog');
    expect(groupWith(rules, '/x-meaning/')).toBe(GROUP.meaning);
  });

  it('can move -meaning ahead of the Product rule', () => {
    const rules = DEFAULT_ENTRY_RULES.map((r) => (r.matchType === 'ends_with' ? { ...r, priority: 5 } : r));
    expect(groupWith(rules, '/product/x-meaning/')).toBe(GROUP.meaning);
    expect(groupWith(rules, '/product/rose/')).toBe(GROUP.product);
  });

  it('a custom ending rule can run ahead of the -meaning rule', () => {
    const rules = [...DEFAULT_ENTRY_RULES, endsWith(95, 'crystal-meaning', 'Crystal guides')];
    expect(groupWith(rules, '/clear-crystal-meaning/')).toBe('Crystal guides');
    expect(groupWith(rules, '/moon-meaning/')).toBe(GROUP.meaning);
  });

  it('keeps list order for equal numbers', () => {
    const rules = [endsWith(10, '-a', 'First'), endsWith(10, 'x-a', 'Second')];
    expect(groupWith(rules, '/x-a/')).toBe('First');
    expect(sortRules(rules).map((r) => r.group)).toEqual(['First', 'Second']);
  });

  it('gives a new rule the next round number, so it runs last', () => {
    expect(nextPriority([])).toBe(10);
    expect(nextPriority(DEFAULT_ENTRY_RULES)).toBe(110);
    expect(nextPriority([exact(105, 'a', 'x')])).toBe(110);
  });

  it('accepts only whole numbers from 0 up', () => {
    expect(parsePriority(' 25 ')).toBe(25);
    expect(parsePriority('0')).toBe(0);
    for (const bad of ['', ' ', '-1', '1.5', 'abc', '1e3', '99999999999999999999']) expect(parsePriority(bad)).toBeNull();
  });
});

describe('editable rules', () => {
  it('reassigns a segment and adds new group names', () => {
    const rules = [...DEFAULT_ENTRY_RULES, exact(110, 'blog', 'Blog'), exact(120, 'cart', 'Cart only')];
    expect(groupWith(rules, 'https://a.test/blog/x/')).toBe('Blog');
    // The lower number wins: cart stays in the default group.
    expect(groupWith(rules, 'https://a.test/cart/')).toBe(GROUP.cart);
  });

  it('normalizes typed values', () => {
    expect(normalizeRuleValue('  /Blog/ ')).toBe('blog');
    expect(normalizeRuleValue(' -Meaning/ ')).toBe('-meaning');
    expect(groupWith([exact(10, ' /Blog/ ', 'Blog')], '/blog/')).toBe('Blog');
    expect(groupWith([endsWith(10, ' -GUIDE/ ', 'Guides')], '/x-guide/')).toBe('Guides');
  });

  it('leaves out blank values and repeats, and falls back to Articles or other for an empty group', () => {
    expect(activeRules([exact(10, '', 'Shop'), exact(20, 'x', '  '), exact(30, 'X/', 'Repeat')])).toEqual([exact(20, 'x', GROUP.other)]);
  });

  it('treats the same value with a different match type as a different rule', () => {
    const rules = [exact(10, 'guide', 'A'), endsWith(20, 'guide', 'B')];
    expect(activeRules(rules)).toHaveLength(2);
    expect(groupWith(rules, '/x/my-guide/')).toBe('B');
  });

  it('lists default groups first, then custom groups A to Z', () => {
    expect(sortGroups(['Zebra', GROUP.other, 'Blog', GROUP.none])).toEqual([GROUP.none, GROUP.other, 'Blog', 'Zebra']);
    expect(groupsForRules([exact(10, 'blog', 'Blog')])).toEqual([
      GROUP.none,
      GROUP.home,
      GROUP.product,
      GROUP.shop,
      GROUP.cart,
      GROUP.meaning,
      GROUP.other,
      'Blog',
    ]);
  });
});

describe('-meaning count helper', () => {
  it('matches paths whose last segment ends in -meaning, ignoring trailing slash and case', () => {
    expect(endsWithMeaning(parseEntry('https://a.test/amethyst-meaning/'))).toBe(true);
    expect(endsWithMeaning(parseEntry('https://a.test/blog/Rose-Quartz-MEANING'))).toBe(true);
    expect(endsWithMeaning(parseEntry('https://a.test/amethyst-meanings/'))).toBe(false);
    expect(endsWithMeaning(parseEntry('https://a.test/meaning/'))).toBe(false);
    expect(endsWithMeaning(parseEntry(''))).toBe(false);
  });
});

describe('rule editing helpers', () => {
  it('updates the exact rule for a segment, or adds one that runs last', () => {
    const base = [exact(10, 'blog', 'Articles or other')];
    expect(setSegmentGroup(base, '/BLOG/', 'Blog')).toEqual([exact(10, 'blog', 'Blog')]);
    expect(setSegmentGroup(base, 'guides', 'Blog')).toEqual([...base, exact(20, 'guides', 'Blog')]);
    expect(setSegmentGroup(base, '  ', 'Blog')).toEqual(base);
  });

  it('does not change an ending rule that has the same value', () => {
    const base = [endsWith(10, 'guides', 'Endings')];
    expect(setSegmentGroup(base, 'guides', 'Blog')).toEqual([...base, exact(20, 'guides', 'Blog')]);
  });

  it('flags blank rules and repeats that run later', () => {
    expect([...ignoredRuleIndexes([exact(10, 'a', 'x'), exact(20, '', 'x'), exact(30, 'A/', 'y')])]).toEqual([1, 2]);
    // The repeat is the one that runs later, even if it comes first in the list.
    expect([...ignoredRuleIndexes([exact(30, 'a', 'x'), exact(10, 'a', 'y')])]).toEqual([0]);
    expect([...ignoredRuleIndexes([exact(10, 'a', 'x'), endsWith(20, 'a', 'y')])]).toEqual([]);
  });
});
