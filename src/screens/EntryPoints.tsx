import { useMemo, useState } from 'react';
import { meaningSummary, segmentsInGroup, summarizeBy, topEntryPaths } from '../lib/aggregate';
import { GROUP, GROUP_ORDER, ignoredRuleIndexes, setSegmentGroup, DEFAULT_ENTRY_RULES, type EntryRule } from '../lib/entry';
import { PRODUCT_LANDING_LABEL, type ProductLandingSummary } from '../lib/items';
import type { AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatMedian, formatPercent, share } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, EmptyState, HowCalculated, ShareBar, StatTile } from '../components/ui';
import { HBarChart } from '../components/charts';

const KEEP = '__keep__';

export function EntryPointsScreen({
  orders,
  rules,
  groups,
  onRulesChange,
  onAddGroup,
  productLanding,
  productLandingStatus,
}: {
  orders: readonly AnalyzedOrder[];
  rules: readonly EntryRule[];
  groups: readonly string[];
  onRulesChange: (rules: EntryRule[]) => void;
  onAddGroup: (name: string) => void;
  productLanding: ProductLandingSummary | null;
  productLandingStatus: 'no-file' | 'no-mapping' | 'no-product-column' | 'ready';
}) {
  const f = useFormat();
  const byGroup = useMemo(() => summarizeBy(orders, (o) => o.entryGroup, (k) => k, { order: groups }), [orders, groups]);
  const paths = useMemo(() => topEntryPaths(orders, 20), [orders]);
  const otherSegments = useMemo(() => segmentsInGroup(orders, GROUP.other, 15), [orders]);
  const meaning = useMemo(() => meaningSummary(orders), [orders]);

  return (
    <div className="screen">
      <Card
        title="Orders by entry group"
        note="The first page of the visit that ended in an order, sorted into groups by the rules below. Shares are of the orders shown."
      >
        {byGroup.length === 0 ? (
          <p className="muted">No orders.</p>
        ) : (
          <HBarChart
            label="Orders and share by entry group"
            rows={byGroup.map((g) => ({
              label: g.label,
              value: g.orders,
              text: `${formatCount(g.orders)} · ${formatPercent(g.share)}`,
              tooltip: [
                { label: 'Orders', value: formatCount(g.orders) },
                { label: 'Share', value: formatPercent(g.share) },
              ],
            }))}
          />
        )}
        <HowCalculated>
          The entry page address is read with the browser’s URL reader. Only the first part of the path counts (for
          /product/rose-quartz/ that is “product”), ignoring capitals, anything after “?” or “#”, and slashes at the end. A
          blank entry page is “{GROUP.none}”. An address with no path is “{GROUP.home}”. Any path not covered by a rule is “
          {GROUP.other}”.
        </HowCalculated>
      </Card>

      <Card title="Pages viewed and order value by entry group" note="Medians show the middle order, so a few very long visits or big orders don’t pull the figure up.">
        <DataTable
          caption="Median pages and median order total by entry group"
          rows={byGroup}
          rowKey={(g) => g.key}
          columns={[
            { header: 'Entry group', cell: (g) => g.label },
            { header: 'Orders', align: 'right', cell: (g) => formatCount(g.orders) },
            { header: 'Share', align: 'right', cell: (g) => formatPercent(g.share) },
            { header: 'Median pages viewed', align: 'right', cell: (g) => formatMedian(g.medianPages) },
            { header: 'Median order total', align: 'right', cell: (g) => f.money(g.medianTotalCents) },
            { header: 'Net sales', align: 'right', cell: (g) => f.money(g.netCents) },
          ]}
        />
        <HowCalculated>
          Median: the orders are sorted and the middle one is taken. With an even number, the two middle values are averaged.
          Blank page counts and unreadable totals are left out. Page counts use the first value when a cell has several.
        </HowCalculated>
      </Card>

      <div className="tiles">
        <StatTile
          label="Orders that started on a “-meaning” page"
          value={formatCount(meaning.orders)}
          sub={`${formatPercent(meaning.share)} of orders · ${formatCount(meaning.paths)} different pages`}
          how="Entry paths that end in “-meaning”, such as /amethyst-meaning/, wherever they sit in the site."
        />
      </div>

      <Card title="Top 20 entry pages" note="The most common first pages, shown as paths only. Query strings and anything after # are removed.">
        <DataTable
          caption="Top 20 entry paths"
          rows={paths}
          rowKey={(p) => p.path}
          empty="No entry pages recorded."
          columns={[
            { header: 'Entry page', className: 'path', cell: (p) => <code>{p.path}</code> },
            { header: 'Entry group', cell: (p) => p.group },
            { header: 'Orders', align: 'right', cell: (p) => formatCount(p.orders) },
            {
              header: 'Share',
              align: 'right',
              cell: (p) => (
                <span className="share-cell">
                  <ShareBar fraction={p.share} />
                  {formatPercent(p.share)}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <RulesEditor rules={rules} groups={groups} onChange={onRulesChange} onAddGroup={onAddGroup} />

      <Card
        title={`Most common pages in “${GROUP.other}”`}
        note="First path parts that no rule covers. Move one to a group to add a rule; every chart updates straight away."
      >
        <DataTable
          caption={`Most common segments in ${GROUP.other}`}
          rows={otherSegments}
          rowKey={(s) => s.segment}
          empty={`No orders are in “${GROUP.other}” with the current filters.`}
          columns={[
            { header: 'First part of path', className: 'path', cell: (s) => <code>/{s.segment}/</code> },
            { header: 'Orders', align: 'right', cell: (s) => formatCount(s.orders) },
            { header: 'Share', align: 'right', cell: (s) => formatPercent(s.share) },
            {
              header: 'Move to',
              cell: (s) => (
                <select
                  aria-label={`Move /${s.segment}/ to a group`}
                  value={KEEP}
                  onChange={(e) => {
                    if (e.target.value !== KEEP) onRulesChange(setSegmentGroup(rules, s.segment, e.target.value));
                  }}
                >
                  <option value={KEEP}>Keep here</option>
                  {groups
                    .filter((g) => g !== GROUP.other)
                    .map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                </select>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="Based on product name matching"
        note="For orders that started on a /product/…/ page: did they buy that product? Needs the optional order items file on the Data check screen."
      >
        {productLandingStatus !== 'ready' || !productLanding ? (
          <EmptyState title="Not available yet">
            {productLandingStatus === 'no-file'
              ? 'Add an order items file on the Data check screen to see this.'
              : productLandingStatus === 'no-mapping'
                ? 'On the Data check screen, choose the order number column, or the email, date and total columns.'
                : 'On the Data check screen, choose the product name or slug column.'}
          </EmptyState>
        ) : productLanding.productStarts === 0 ? (
          <p className="muted">No orders started on a product page with the current filters.</p>
        ) : (
          <>
            <HBarChart
              label="Product page starts by match result"
              labelWidth={250}
              rows={(['bought', 'different', 'unchecked'] as const).map((k) => ({
                label: PRODUCT_LANDING_LABEL[k],
                value: productLanding[k],
                text: `${formatCount(productLanding[k])} · ${formatPercent(share(productLanding[k], productLanding.productStarts))}`,
                tooltip: [
                  { label: 'Orders', value: formatCount(productLanding[k]) },
                  { label: 'Share of product page starts', value: formatPercent(share(productLanding[k], productLanding.productStarts)) },
                ],
              }))}
            />
            <p className="muted small">Shares are of the {formatCount(productLanding.productStarts)} orders that started on a product page.</p>
          </>
        )}
        <HowCalculated>
          The slug in /product/&lt;slug&gt;/ is compared with the product names or slugs bought in the matched order. Both are
          lowercased, accents and punctuation are removed and spaces become hyphens, so “Tiger’s Eye Bracelet” matches
          /product/tigers-eye-bracelet/. Orders that are unmatched or ambiguous in the items file, or have no product slug,
          are counted as “Couldn’t check”. Renamed products or different naming will show as “different product”.
        </HowCalculated>
      </Card>
    </div>
  );
}

function RulesEditor({
  rules,
  groups,
  onChange,
  onAddGroup,
}: {
  rules: readonly EntryRule[];
  groups: readonly string[];
  onChange: (rules: EntryRule[]) => void;
  onAddGroup: (name: string) => void;
}) {
  const [newSegment, setNewSegment] = useState('');
  const [newGroup, setNewGroup] = useState<string>(GROUP.other);
  const [groupName, setGroupName] = useState('');
  const ignored = ignoredRuleIndexes(rules);
  const update = (i: number, patch: Partial<EntryRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));
  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_ENTRY_RULES);
  const trimmedGroup = groupName.trim();
  const canCreate = trimmedGroup !== '' && !groups.includes(trimmedGroup);
  const createGroup = () => {
    if (!canCreate) return;
    onAddGroup(trimmedGroup);
    setNewGroup(trimmedGroup);
    setGroupName('');
  };

  return (
    <Card
      title="Entry page rules"
      note={`Which group each first path part belongs to. Blank entry pages are always “${GROUP.none}”, addresses with no path are always “${GROUP.home}”, and anything not listed is “${GROUP.other}”.`}
      actions={
        <button type="button" className="button button-small" onClick={() => onChange([...DEFAULT_ENTRY_RULES])} disabled={isDefault}>
          Reset to default rules
        </button>
      }
    >
      <div className="table-wrap">
        <table className="rules-table">
          <caption className="visually-hidden">Entry page rules</caption>
          <thead>
            <tr>
              <th scope="col">First part of path</th>
              <th scope="col">Entry group</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className={ignored.has(i) ? 'row-ignored' : undefined}>
                <td>
                  <input
                    type="text"
                    value={r.segment}
                    aria-label={`Path part for rule ${i + 1}`}
                    onChange={(e) => update(i, { segment: e.target.value })}
                    spellCheck={false}
                  />
                  {ignored.has(i) ? <span className="badge badge-warn">Ignored: blank or repeated</span> : null}
                </td>
                <td>
                  <select value={r.group} aria-label={`Entry group for rule ${i + 1}`} onChange={(e) => update(i, { group: e.target.value })}>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <button type="button" className="button button-small button-quiet" onClick={() => remove(i)} aria-label={`Remove rule ${i + 1} (${r.segment || 'blank'})`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <input
                  type="text"
                  value={newSegment}
                  placeholder="e.g. blog"
                  aria-label="Path part for a new rule"
                  onChange={(e) => setNewSegment(e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <select value={newGroup} aria-label="Entry group for a new rule" onChange={(e) => setNewGroup(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </td>
              <td className="num">
                <button
                  type="button"
                  className="button button-small button-primary"
                  disabled={newSegment.trim() === ''}
                  onClick={() => {
                    onChange([...rules, { segment: newSegment.trim().toLowerCase(), group: newGroup }]);
                    setNewSegment('');
                  }}
                >
                  Add rule
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="inline-form">
        <div className="field">
          <label htmlFor="new-group">New group name</label>
          <input
            id="new-group"
            type="text"
            value={groupName}
            placeholder="e.g. Blog"
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                createGroup();
              }
            }}
          />
        </div>
        <button type="button" className="button button-small" onClick={createGroup} disabled={!canCreate}>
          Create group
        </button>
        <span className="muted small">New groups appear in every “Entry group” list. Default groups: {GROUP_ORDER.join(', ')}.</span>
      </div>
    </Card>
  );
}
