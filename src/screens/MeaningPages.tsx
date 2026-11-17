import { useMemo } from 'react';
import { GROUP } from '../lib/entry';
import { ENTRY_PAGE_LABEL, MEANING_SALES_NOTE, TIME_SINCE_ENTRY_LABEL } from '../lib/labels';
import { meaningPagesSummary, TOP_MEANING_PAGES } from '../lib/meaning';
import type { AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatPercent } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, EmptyState, StatTile } from '../components/ui';

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

export function MeaningPagesScreen({ orders }: { orders: readonly AnalyzedOrder[] }) {
  const f = useFormat();
  const s = useMemo(() => meaningPagesSummary(orders), [orders]);
  const intro = (
    <p className="screen-intro">
      Orders whose {ENTRY_PAGE_LABEL.toLowerCase()} is in the “{GROUP.meaning}” group. Uses the filters above, so it can
      differ from Data check.
    </p>
  );

  if (s.meaning.orders === 0) {
    return (
      <div className="screen">
        {intro}
        <EmptyState title="No meaning page orders">
          No orders have a {ENTRY_PAGE_LABEL.toLowerCase()} in “{GROUP.meaning}” with the current filters and rules.
        </EmptyState>
      </div>
    );
  }

  const rows = s.pages.map((p, i) => ({ ...p, rank: i + 1 }));
  return (
    <div className="screen">
      {intro}

      <div className="tiles tiles-4">
        <StatTile
          label="Orders"
          value={formatCount(s.meaning.orders)}
          sub={`${formatPercent(s.orderShare)} of all orders`}
          how={`Counted orders, after the filters, whose ${ENTRY_PAGE_LABEL.toLowerCase()} is in the “${GROUP.meaning}” group. The share is of all orders shown.`}
        />
        <StatTile
          label="Net sales"
          value={f.money(s.netCents)}
          sub={s.netShare === null ? 'No share: all net sales are zero or below' : `${formatPercent(s.netShare)} of all net sales`}
          how="Order Total minus Refund Total for these orders, the same rule as on the other screens."
        />
        <StatTile
          label="First and repeat orders"
          value={
            <TileLines
              rows={[
                { label: 'First', count: s.meaning.first, share: s.meaning.firstShare },
                { label: 'Repeat', count: s.meaning.repeat, share: s.meaning.repeatShare },
              ]}
            />
          }
          sub={`All orders: ${formatPercent(s.all.firstShare)} first`}
          how="The same rule as New vs repeat: an email’s first counted order in the file is a first order, and later ones are repeat orders. Shares are of meaning page orders. Customers who bought before the file starts will look new."
        />
        <StatTile
          label={TIME_SINCE_ENTRY_LABEL}
          value={
            <TileLines
              rows={[
                { label: 'Over 1 day', count: s.meaning.over1Day, share: s.meaning.over1DayShare },
                { label: 'Over 7 days', count: s.meaning.over7Days, share: s.meaning.over7DaysShare },
              ]}
            />
          }
          sub={`All orders: ${formatPercent(s.all.over1DayShare)} · ${formatPercent(s.all.over7DaysShare)}`}
          how="Order Date minus the tracked entry time. Over 1 day means more than 1,440 minutes and over 7 days means more than 10,080 minutes, so exactly 1 day or exactly 7 days does not count. Shares are of all meaning page orders, including orders with no tracked entry time. A long gap suggests the saved page and time come from an earlier visit. The two times may be recorded in different time zones."
        />
      </div>

      <Card title="Top meaning pages by net sales">
        <DataTable
          caption="Top meaning pages by net sales"
          rows={rows}
          rowKey={(p) => p.path}
          columns={[
            { header: '#', align: 'right', cell: (p) => p.rank },
            { header: 'Page', className: 'path', cell: (p) => <code>{p.path}</code> },
            { header: 'Orders', align: 'right', cell: (p) => formatCount(p.orders) },
            { header: 'Net sales', align: 'right', cell: (p) => f.money(p.netCents) },
          ]}
        />
        <p className="muted small">
          {s.pageCount > TOP_MEANING_PAGES
            ? `Top ${TOP_MEANING_PAGES} of ${formatCount(s.pageCount)} meaning pages with orders.`
            : `All ${formatCount(s.pageCount)} meaning ${s.pageCount === 1 ? 'page' : 'pages'} with orders.`}
        </p>
        <p className="note">{MEANING_SALES_NOTE}</p>
      </Card>
    </div>
  );
}
