import { useMemo, useState, type ReactNode } from 'react';
import { dayKey, formatDayKey } from '../lib/dates';
import { GROUP } from '../lib/entry';
import type { Filters } from '../lib/filters';
import { ENTRY_GROUP_LABEL, ENTRY_PAGE_LABEL, MEANING_SALES_NOTE, noEmailNote, TIME_SINCE_ENTRY_LABEL } from '../lib/labels';
import { GAP_BAND_LABEL, GAP_BANDS, meaningPagesSummary, TOP_MEANING_PAGES, type MeaningSort, type OrderMix } from '../lib/meaning';
import { CUSTOMER_TYPE_LABEL, type AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatPercent, plural, share } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, EmptyState, HowCalculated, Select, StatTile } from '../components/ui';

const SORT_LABEL: Readonly<Record<MeaningSort, string>> = { net: 'net sales', orders: 'orders' };
const SORT_OPTIONS = [
  { value: 'net', label: 'Net sales' },
  { value: 'orders', label: 'Orders' },
];

/** Two labelled figures inside one tile. */
function TileLines({ rows }: { rows: ReadonlyArray<{ label: string; count: number; share: number }> }) {
  return (
    <span className="tile-lines">
      {rows.map((r) => (
        <span key={r.label} className="tile-line">
          <span className="tile-line-label">{r.label}</span>
          <span>
            {formatCount(r.count)} <span className="tile-line-share">· {formatPercent(r.share)}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

interface TableRow {
  key: string;
  rank: number | null;
  page: ReactNode;
  orders: number;
  ordersShare: number;
  netCents: number;
  netShare: number | null;
  averageCents: number | null;
}

export function MeaningPagesScreen({
  orders,
  filters,
  onClearFilter,
}: {
  orders: readonly AnalyzedOrder[];
  filters: Filters;
  onClearFilter: (key: keyof Filters) => void;
}) {
  const f = useFormat();
  const [sort, setSort] = useState<MeaningSort>('net');
  const s = useMemo(() => meaningPagesSummary(orders, sort), [orders, sort]);
  const groupFilter = filters.entryGroup;
  const range =
    s.firstDateSec !== null && s.lastDateSec !== null
      ? `${formatDayKey(dayKey(s.firstDateSec))} to ${formatDayKey(dayKey(s.lastDateSec))}`
      : null;

  const clearGroupButton = (
    <button type="button" className="button button-small" onClick={() => onClearFilter('entryGroup')}>
      Clear the {ENTRY_GROUP_LABEL.toLowerCase()} filter
    </button>
  );
  const intro = (
    <>
      <p className="screen-intro">
        Orders whose {ENTRY_PAGE_LABEL.toLowerCase()} is in the “{GROUP.meaning}” group, compared with the other orders in view.
      </p>
      <p className="note">
        {range ? (
          <>
            Order dates in view: <strong>{range}</strong>.{' '}
          </>
        ) : (
          'No Order Date in view can be read. '
        )}
        To compare with a traffic report, set the same dates in the filters above. Order Date is read as written, with no time
        zone, so a day here may not start at the same moment as in your analytics tool. Data check ignores the filters and
        uses every counted order, so its {GROUP.meaning} figures can differ from this screen.
      </p>
    </>
  );

  if (s.meaning.orders === 0) {
    const otherGroup = groupFilter !== null && groupFilter !== GROUP.meaning;
    return (
      <div className="screen">
        {intro}
        <EmptyState title="No meaning page orders" action={otherGroup ? clearGroupButton : undefined}>
          {otherGroup
            ? `The ${ENTRY_GROUP_LABEL.toLowerCase()} filter is set to “${groupFilter}”, so only those orders are in view.`
            : `No orders have a ${ENTRY_PAGE_LABEL.toLowerCase()} in “${GROUP.meaning}” with the current filters and rules.`}
        </EmptyState>
      </div>
    );
  }

  /** "Other orders: …", or a plain note when there are none to compare with. */
  const vsOther = (text: (o: OrderMix) => string) =>
    s.other.orders === 0 ? 'Other orders: none in view' : `Other orders: ${text(s.other)}`;
  const otherShare = (count: number) => (s.other.orders === 0 ? '–' : formatPercent(share(count, s.other.orders)));

  const bandRows = [
    ...GAP_BANDS.map((b) => ({ key: b, label: GAP_BAND_LABEL[b], meaning: s.meaning.bands[b], other: s.other.bands[b] })),
    { key: 'total', label: 'Total', meaning: s.meaning.orders, other: s.other.orders },
  ];

  const pageRows: TableRow[] = s.pages.map((p, i) => ({ ...p, key: p.path, rank: i + 1, page: <code>{p.path}</code> }));
  if (s.rest) pageRows.push({ ...s.rest, key: '#rest', rank: null, page: `Other ${plural(s.rest.pageCount, 'page', 'pages')}` });
  pageRows.push({
    key: '#all',
    rank: null,
    page: `All ${GROUP.meaning.toLowerCase()}`,
    orders: s.meaning.orders,
    ordersShare: 1,
    netCents: s.meaning.netCents,
    netShare: s.meaning.netCents > 0 ? 1 : null,
    averageCents: s.meaning.averageCents,
  });

  const customerFilter = filters.customerType;

  return (
    <div className="screen">
      {intro}

      {groupFilter === GROUP.meaning ? (
        <div className="alert alert-info" role="status">
          <p>
            The {ENTRY_GROUP_LABEL.toLowerCase()} filter is set to “{GROUP.meaning}”, so there are no other orders to compare with.
          </p>
          {clearGroupButton}
        </div>
      ) : null}

      <div className="tiles tiles-4">
        <StatTile
          label="Orders"
          value={formatCount(s.meaning.orders)}
          sub={`${formatPercent(s.orderShare)} of all orders in view`}
          how={`Counted orders, after the filters, whose ${ENTRY_PAGE_LABEL.toLowerCase()} is in the “${GROUP.meaning}” group. The share is of all orders in view, these included.`}
        />
        <StatTile
          label="Net sales"
          value={f.money(s.meaning.netCents)}
          sub={s.netShare === null ? 'No share: all net sales are zero or below' : `${formatPercent(s.netShare)} of all net sales in view`}
          how="Order Total minus Refund Total for these orders, the same rule as on the other screens. The share is of all net sales in view, these included."
        />
        <StatTile
          label="Average net sale per order"
          value={f.money(s.meaning.averageCents)}
          sub={vsOther((o) => f.money(o.averageCents))}
          how="Net sales divided by the number of orders, for these orders and for the other orders in view. An Order Total that can’t be read counts as 0, as in net sales. A few large orders can pull an average up."
        />
        <StatTile
          label="First and repeat orders"
          value={
            customerFilter !== null ? (
              <span className="tile-value-small">Not compared</span>
            ) : (
              <TileLines
                rows={[
                  { label: 'First', count: s.meaning.first, share: s.meaning.firstShare },
                  { label: 'Repeat', count: s.meaning.repeat, share: s.meaning.repeatShare },
                ]}
              />
            )
          }
          sub={
            customerFilter !== null
              ? `The Customer type filter is on, so every order here is a “${CUSTOMER_TYPE_LABEL[customerFilter].toLowerCase()}”.`
              : vsOther((o) => `${formatPercent(o.firstShare)} first`)
          }
          how={`The same rule as New vs repeat: an email’s first counted order in the file is a first order in file, and later ones are repeat orders. Shares are of these orders. Customers who bought before the file starts will look new. ${noEmailNote('Meaning page orders', s.meaning.noEmail)}`}
        />
      </div>

      <Card
        title={TIME_SINCE_ENTRY_LABEL}
        note={`How long before the order the ${ENTRY_PAGE_LABEL.toLowerCase()} was saved. A long gap suggests the saved page comes from an earlier visit. Each order is in one row, so each column adds up to its total.`}
        actions={<span className="badge badge-warn">Time zone not confirmed</span>}
      >
        <div className="has-total-row table-wide">
          <DataTable
            caption={`${TIME_SINCE_ENTRY_LABEL} for meaning page orders and other orders`}
            rows={bandRows}
            rowKey={(r) => r.key}
            columns={[
              { header: TIME_SINCE_ENTRY_LABEL, cell: (r) => r.label },
              { header: 'Meaning page orders', align: 'right', cell: (r) => formatCount(r.meaning) },
              { header: 'Share of meaning page orders', align: 'right', cell: (r) => formatPercent(share(r.meaning, s.meaning.orders)) },
              { header: 'Other orders', align: 'right', cell: (r) => formatCount(r.other) },
              { header: 'Share of other orders', align: 'right', cell: (r) => otherShare(r.other) },
            ]}
          />
        </div>
        <HowCalculated>
          Order Date minus the tracked entry time. Within 1 day is up to 1,440 minutes, so exactly 1 day counts here. More than 1
          day, up to 7 days is more than 1,440 and up to 10,080 minutes. Over 7 days is more than 10,080 minutes. “Tracked entry
          time after the Order Date” usually means the two times are recorded in different time zones. “No tracked entry time”
          means the tracked entry time or the Order Date can’t be read. The second and third rows added together match “Over 1
          day” on Data check, and the third row matches “Over 7 days”, when no filters are on.
        </HowCalculated>
      </Card>

      <Card
        title={`Top meaning pages by ${SORT_LABEL[sort]}`}
        actions={
          <Select
            id="meaning-sort"
            label="Sort by"
            value={sort}
            onChange={(v) => setSort(v === 'orders' ? 'orders' : 'net')}
            options={SORT_OPTIONS}
          />
        }
      >
        <div className="has-total-row table-wide">
          <DataTable
            caption={`Top meaning pages by ${SORT_LABEL[sort]}`}
            rows={pageRows}
            rowKey={(r) => r.key}
            columns={[
              { header: '#', align: 'right', cell: (r) => r.rank ?? '' },
              { header: 'Page', className: 'path', cell: (r) => r.page },
              { header: 'Orders', align: 'right', cell: (r) => formatCount(r.orders) },
              { header: 'Share of orders', align: 'right', cell: (r) => formatPercent(r.ordersShare) },
              { header: 'Net sales', align: 'right', cell: (r) => f.money(r.netCents) },
              { header: 'Share of net sales', align: 'right', cell: (r) => (r.netShare === null ? '–' : formatPercent(r.netShare)) },
              { header: 'Average per order', align: 'right', cell: (r) => f.money(r.averageCents) },
            ]}
          />
        </div>
        <p className="muted small">
          {s.rest
            ? `Top ${TOP_MEANING_PAGES} of ${formatCount(s.pageCount)} meaning pages with orders. The other ${plural(s.rest.pageCount, 'page is', 'pages are')} added together in one row.`
            : `All ${formatCount(s.pageCount)} meaning ${s.pageCount === 1 ? 'page' : 'pages'} with orders.`}
        </p>
        <p className="note">{MEANING_SALES_NOTE}</p>
        <HowCalculated>
          {sort === 'net'
            ? 'Pages are ranked by net sales, then by orders.'
            : 'Pages are ranked by orders, then by net sales.'}{' '}
          Shares are of all meaning page orders and of their net sales. Average per order is net sales divided by orders. The
          same page with different capital letters, a trailing slash or a query string is counted once.
        </HowCalculated>
      </Card>
    </div>
  );
}
