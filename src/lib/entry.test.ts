import { describe, expect, it } from 'vitest';
import {
  buildRuleMap,
  DEFAULT_ENTRY_RULES,
  endsWithMeaning,
  entryGroupFor,
  GROUP,
  groupsForRules,
  normalizeSegment,
  parseEntry,
  sortGroups,
} from './entry';

const defaults = buildRuleMap(DEFAULT_ENTRY_RULES);
const groupOf = (url: string) => entryGroupFor(parseEntry(url), defaults);

describe('parseEntry', () => {
  it('treats a blank value as no entry page', () => {
    expect(parseEntry('')).toEqual({ kind: 'blank', path: null, segment: null, productSlug: null });
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
      productSlug: 'rose-quartz',
    });
    expect(parseEntry('https://shop.example.test/shop///').path).toBe('/shop');
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
    ['https://a.test/amethyst-meaning/', GROUP.other],
    ['https://a.test/blog/how-to-cleanse/', GROUP.other],
    ['https://a.test/SHOP/', GROUP.shop],
    ['https://a.test/products/x/', GROUP.other],
  ])('%s → %s', (url, group) => {
    expect(groupOf(url)).toBe(group);
  });
});

describe('editable rules', () => {
  it('reassigns a segment and adds new group names', () => {
    const rules = [...DEFAULT_ENTRY_RULES, { segment: 'blog', group: 'Blog' }, { segment: 'cart', group: 'Cart only' }];
    const map = buildRuleMap(rules);
    expect(entryGroupFor(parseEntry('https://a.test/blog/x/'), map)).toBe('Blog');
    // The first rule for a segment wins: cart stays in the default group.
    expect(entryGroupFor(parseEntry('https://a.test/cart/'), map)).toBe(GROUP.cart);
  });

  it('normalizes typed segments', () => {
    expect(normalizeSegment('  /Blog/ ')).toBe('blog');
    const map = buildRuleMap([{ segment: ' /Blog/ ', group: 'Blog' }]);
    expect(map.get('blog')).toBe('Blog');
  });

  it('ignores empty segments and falls back to Articles or other for an empty group', () => {
    const map = buildRuleMap([
      { segment: '', group: 'Shop' },
      { segment: 'x', group: '  ' },
    ]);
    expect(map.size).toBe(1);
    expect(map.get('x')).toBe(GROUP.other);
  });

  it('lists default groups first, then custom groups A to Z', () => {
    expect(sortGroups(['Zebra', GROUP.other, 'Blog', GROUP.none])).toEqual([GROUP.none, GROUP.other, 'Blog', 'Zebra']);
    expect(groupsForRules([{ segment: 'blog', group: 'Blog' }])).toEqual([
      GROUP.none,
      GROUP.home,
      GROUP.product,
      GROUP.shop,
      GROUP.cart,
      GROUP.other,
      'Blog',
    ]);
  });
});

describe('-meaning pages', () => {
  it('matches paths that end in -meaning, ignoring trailing slash and case', () => {
    expect(endsWithMeaning(parseEntry('https://a.test/amethyst-meaning/'))).toBe(true);
    expect(endsWithMeaning(parseEntry('https://a.test/blog/Rose-Quartz-MEANING'))).toBe(true);
    expect(endsWithMeaning(parseEntry('https://a.test/amethyst-meanings/'))).toBe(false);
    expect(endsWithMeaning(parseEntry('https://a.test/meaning/'))).toBe(false);
    expect(endsWithMeaning(parseEntry(''))).toBe(false);
  });
});

describe('rule editing helpers', () => {
  it('updates the existing rule for a segment, or adds one', async () => {
    const { setSegmentGroup } = await import('./entry');
    const base = [{ segment: 'blog', group: 'Articles or other' }];
    expect(setSegmentGroup(base, '/BLOG/', 'Blog')).toEqual([{ segment: 'blog', group: 'Blog' }]);
    expect(setSegmentGroup(base, 'guides', 'Blog')).toEqual([...base, { segment: 'guides', group: 'Blog' }]);
    expect(setSegmentGroup(base, '  ', 'Blog')).toEqual(base);
  });

  it('flags blank and duplicate rules as ignored', async () => {
    const { ignoredRuleIndexes } = await import('./entry');
    expect([...ignoredRuleIndexes([{ segment: 'a', group: 'x' }, { segment: '', group: 'x' }, { segment: 'A/', group: 'y' }])]).toEqual([1, 2]);
  });
});
