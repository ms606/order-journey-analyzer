import { useMemo, useState } from 'react';
import { meaningSummary, segmentsInGroup, summarizeBy, topEntryPaths } from '../lib/aggregate';
import {
  DEFAULT_ENTRY_RULES,
  GROUP,
  GROUP_ORDER,
  ignoredRuleIndexes,
  MATCH_TYPE_LABEL,
  MATCH_TYPES,
  nextPriority,
  normalizeRuleValue,
  parsePriority,
  setSegmentGroup,
  sortRules,
  type EntryRule,
  type MatchType,
} from '../lib/entry';
import { PRODUCT_LANDING_LABEL, type ProductLandingSummary } from '../lib/items';
import { ENTRY_GROUP_LABEL, ENTRY_PAGE_LABEL, ENTRY_PAGE_NOTE, PAGES_LABEL, PAGES_NOTE } from '../lib/labels';
import { redactEmails } from '../lib/privacy';
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
      <p className="screen-intro">{ENTRY_PAGE_NOTE}</p>

      <Card
        title={`Orders by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
        note={`Each order’s ${ENTRY_PAGE_LABEL.toLowerCase()}, sorted into groups by the rules below. Shares are of the orders shown.`}
      >
        {byGroup.length === 0 ? (
          <p className="muted">No orders.</p>
        ) : (
          <HBarChart
            label={`Orders and share by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
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
          The address is read with the browser’s URL reader, ignoring capitals, anything after “?” or “#”, and slashes at the
          end. A blank address is “{GROUP.none}”. An address with no path is “{GROUP.home}”. Every other address goes through the
          rules below, lowest priority number first, and the first match sets the group. Any path no rule matches is “
          {GROUP.other}”.
        </HowCalculated>
      </Card>

      <Card
        title={`${PAGES_LABEL} and order value by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
        note={`Medians show the middle order, so a few very long sessions or big orders don’t pull the figure up. ${PAGES_NOTE}`}
      >
        <DataTable
          caption={`Median ${PAGES_LABEL.toLowerCase()} and median order total by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
          rows={byGroup}
          rowKey={(g) => g.key}
          columns={[
            { header: ENTRY_GROUP_LABEL, cell: (g) => g.label },
            { header: 'Orders', align: 'right', cell: (g) => formatCount(g.orders) },
            { header: 'Share', align: 'right', cell: (g) => formatPercent(g.share) },
            { header: `Median ${PAGES_LABEL.toLowerCase()}`, align: 'right', cell: (g) => formatMedian(g.medianPages) },
            { header: 'Median order total', align: 'right', cell: (g) => f.money(g.medianTotalCents) },
            { header: 'Net sales', align: 'right', cell: (g) => f.money(g.netCents) },
          ]}
        />
        <HowCalculated>
          Median: the orders are sorted and the middle one is taken. With an even number, the two middle values are averaged.
          Blanks and unreadable totals are left out. {PAGES_LABEL} uses the first value when a cell has several.
        </HowCalculated>
      </Card>

      <div className="tiles">
        <StatTile
          label={`Orders with a ${ENTRY_PAGE_LABEL.toLowerCase()} ending in “-meaning”`}
          value={formatCount(meaning.orders)}
          sub={`${formatPercent(meaning.share)} of orders · ${formatCount(meaning.paths)} different pages`}
          how={`Paths whose last part ends in “-meaning”, such as /amethyst-meaning/, wherever they sit in the site. This includes any that a rule put in another group, such as /shop/amethyst-meaning/, so it can be higher than the “${GROUP.meaning}” group.`}
        />
      </div>

      <Card title={`Top 20 ${ENTRY_PAGE_LABEL.toLowerCase()}s`} note="The most common pages, shown as paths only. Query strings and anything after # are removed.">
        <DataTable
          caption={`Top 20 by ${ENTRY_PAGE_LABEL.toLowerCase()}`}
          rows={paths}
          rowKey={(p) => p.path}
          empty="Nothing recorded."
          columns={[
            { header: ENTRY_PAGE_LABEL, className: 'path', cell: (p) => <code>{p.path}</code> },
            { header: ENTRY_GROUP_LABEL, cell: (p) => p.group },
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
        note={`First path parts that no rule covers. Move one to a group to add a rule; every chart updates straight away. The new rule runs last, so pages ending in “-meaning” stay in “${GROUP.meaning}” unless you give it a lower priority number.`}
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
        note={`For orders whose ${ENTRY_PAGE_LABEL.toLowerCase()} is a /product/…/ page: did they buy that product? Needs the optional order items file on the Data check screen.`}
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
          <p className="muted">No orders have a product page as their {ENTRY_PAGE_LABEL.toLowerCase()} with the current filters.</p>
        ) : (
          <>
            <HBarChart
              label={`Orders with a product page as their ${ENTRY_PAGE_LABEL.toLowerCase()}, by match result`}
              labelWidth={250}
              rows={(['bought', 'different', 'unchecked'] as const).map((k) => ({
                label: PRODUCT_LANDING_LABEL[k],
                value: productLanding[k],
                text: `${formatCount(productLanding[k])} · ${formatPercent(share(productLanding[k], productLanding.productStarts))}`,
                tooltip: [
                  { label: 'Orders', value: formatCount(productLanding[k]) },
                  { label: 'Share of these orders', value: formatPercent(share(productLanding[k], productLanding.productStarts)) },
                ],
              }))}
            />
            <p className="muted small">
              Shares are of the {formatCount(productLanding.productStarts)} orders with a product page as their{' '}
              {ENTRY_PAGE_LABEL.toLowerCase()}.
            </p>
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

/** A priority field. A change applies when the field loses focus or Enter is pressed, so rows don't reorder while typing. */
function PriorityInput({ value, label, onCommit }: { value: number; label: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() !== String(value)) onCommit(draft);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      className="priority-input"
      value={draft ?? String(value)}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function MatchTypeSelect({ value, label, onChange }: { value: MatchType; label: string; onChange: (m: MatchType) => void }) {
  return (
    <select className="match-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as MatchType)}>
      {MATCH_TYPES.map((m) => (
        <option key={m} value={m}>
          {MATCH_TYPE_LABEL[m]}
        </option>
      ))}
    </select>
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
  const [newMatchType, setNewMatchType] = useState<MatchType>('exact_segment');
  const [newValue, setNewValue] = useState('');
  const [newGroup, setNewGroup] = useState<string>(GROUP.other);
  const [groupName, setGroupName] = useState('');
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const ignored = ignoredRuleIndexes(rules);
  const update = (i: number, patch: Partial<EntryRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));
  // Each rule keeps its own number, so the run order is the same in this app, the CSV and the database.
  const setPriority = (i: number, text: string) => {
    const priority = parsePriority(text);
    if (priority === null) {
      setPriorityError(`“${text.trim()}” is not a whole number, so the priority was not changed.`);
    } else if (rules.some((r, j) => j !== i && r.priority === priority)) {
      setPriorityError(`Priority ${priority} is already used by another rule, so the priority was not changed.`);
    } else {
      setPriorityError(null);
      onChange(sortRules(rules.map((r, j) => (j === i ? { ...r, priority } : r))));
    }
  };
  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_ENTRY_RULES);
  const trimmedGroup = redactEmails(groupName.trim());
  const canCreate = trimmedGroup !== '' && !groups.includes(trimmedGroup);
  const createGroup = () => {
    if (!canCreate) return;
    onAddGroup(trimmedGroup);
    setNewGroup(trimmedGroup);
    setGroupName('');
  };

  return (
    <Card
      title={`${ENTRY_PAGE_LABEL} rules`}
      note={`Rules run from the lowest priority number, and the first match sets the group. “${MATCH_TYPE_LABEL.exact_segment}” compares the first part of the path; “${MATCH_TYPE_LABEL.ends_with}” compares the last part of the path. Three fixed rules sit outside this list and the CSV: a blank address is always “${GROUP.none}”, an address with no path is always “${GROUP.home}”, and anything no rule matches is “${GROUP.other}”.`}
      actions={
        <button
          type="button"
          className="button button-small"
          onClick={() => {
            setPriorityError(null);
            onChange([...DEFAULT_ENTRY_RULES]);
          }}
          disabled={isDefault}
        >
          Reset to default rules
        </button>
      }
    >
      <div className="table-wrap">
        <table className="rules-table">
          <caption className="visually-hidden">{ENTRY_PAGE_LABEL} rules</caption>
          <thead>
            <tr>
              <th scope="col">Priority</th>
              <th scope="col">Path match</th>
              <th scope="col">Value</th>
              <th scope="col">Group</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className={ignored.has(i) ? 'row-ignored' : undefined}>
                <td>
                  <PriorityInput value={r.priority} label={`Priority for rule ${i + 1}`} onCommit={(text) => setPriority(i, text)} />
                </td>
                <td>
                  <MatchTypeSelect value={r.matchType} label={`Match for rule ${i + 1}`} onChange={(matchType) => update(i, { matchType })} />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.value}
                    aria-label={`Value for rule ${i + 1}`}
                    onChange={(e) => update(i, { value: e.target.value })}
                    spellCheck={false}
                  />
                  {ignored.has(i) ? <span className="badge badge-warn">Ignored: blank or repeated</span> : null}
                </td>
                <td>
                  <select value={r.group} aria-label={`Group for rule ${i + 1}`} onChange={(e) => update(i, { group: e.target.value })}>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <button type="button" className="button button-small button-quiet" onClick={() => remove(i)} aria-label={`Remove rule ${i + 1} (${r.value || 'blank'})`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <span className="muted">{nextPriority(rules)}</span>
              </td>
              <td>
                <MatchTypeSelect value={newMatchType} label="Match for a new rule" onChange={setNewMatchType} />
              </td>
              <td>
                <input
                  type="text"
                  value={newValue}
                  placeholder={newMatchType === 'ends_with' ? 'e.g. -guide' : 'e.g. blog'}
                  aria-label="Value for a new rule"
                  onChange={(e) => setNewValue(e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <select value={newGroup} aria-label="Group for a new rule" onChange={(e) => setNewGroup(e.target.value)}>
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
                  disabled={normalizeRuleValue(newValue) === ''}
                  onClick={() => {
                    onChange([...rules, { priority: nextPriority(rules), matchType: newMatchType, value: normalizeRuleValue(newValue), group: newGroup }]);
                    setNewValue('');
                  }}
                >
                  Add rule
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {priorityError ? (
        <p className="text-warn small" role="alert">
          {priorityError}
        </p>
      ) : null}
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
        <span className="muted small">New groups appear in every group list. Default groups: {GROUP_ORDER.join(', ')}.</span>
      </div>
    </Card>
  );
}
