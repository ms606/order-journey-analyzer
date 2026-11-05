import { useMemo } from 'react';
import { firstVsRepeatByGroup, pageBandsByType, summaryByCustomerType } from '../lib/aggregate';
import type { AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatMedian, formatPercent, plural } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, Legend, ShowNumbers, StatTile } from '../components/ui';
import { PairedColumnChart, PairedHBarChart } from '../components/charts';

const LEGEND = [
  { label: 'First order in file', tone: 'first' as const },
  { label: 'Repeat order', tone: 'repeat' as const },
];

export function NewVsRepeatScreen({ orders, groups }: { orders: readonly AnalyzedOrder[]; groups: readonly string[] }) {
  const f = useFormat();
  const types = useMemo(() => summaryByCustomerType(orders), [orders]);
  const paired = useMemo(() => {
    const rows = firstVsRepeatByGroup(orders, groups);
    return rows.filter((r) => r.first + r.repeat > 0);
  }, [orders, groups]);
  const bands = useMemo(() => pageBandsByType(orders), [orders]);

  return (
    <div className="screen">
      <p className="screen-intro">
        A <strong>first order in file</strong> is a customer’s earliest counted order in this export; every later one is a{' '}
        <strong>repeat order</strong>. Customers who bought before the export starts will look new.
      </p>
      <div className="tiles">
        <StatTile
          label="First orders"
          value={formatCount(types.first.orders)}
          sub={`Median order total ${f.money(types.first.medianTotalCents)}`}
          how="Each email’s earliest counted order, sorted by Order Date and then order number."
        />
        <StatTile
          label="Repeat orders"
          value={formatCount(types.repeat.orders)}
          sub={`Median order total ${f.money(types.repeat.medianTotalCents)}`}
          how="Every counted order after an email’s first one. Not based on the visit count."
        />
        <StatTile
          label="Median pages, first orders"
          value={formatMedian(types.first.medianPages)}
          sub={`from ${formatCount(types.first.pagesRecorded)} orders with a page count`}
          how="Middle value of pages viewed in the visit that ended in the order. With an even number of orders, the two middle values are averaged. Blank page counts are left out."
        />
        <StatTile
          label="Median pages, repeat orders"
          value={formatMedian(types.repeat.medianPages)}
          sub={`from ${formatCount(types.repeat.pagesRecorded)} orders with a page count`}
          how="Same as for first orders, for repeat orders only."
        />
      </div>

      <Card
        title="Where first and repeat orders start"
        note="For each entry group: the share of first orders (blue) and the share of repeat orders (grey) that started there. Each colour adds up to 100% on its own, so the bars compare the mix, not the totals."
      >
        <Legend items={LEGEND} />
        {paired.length === 0 ? (
          <p className="muted">No orders.</p>
        ) : (
          <PairedHBarChart
            label="Entry group share for first and repeat orders"
            rows={paired.map((r) => ({ label: r.group, first: r.firstShare, repeat: r.repeatShare, firstCount: r.first, repeatCount: r.repeat }))}
          />
        )}
        <ShowNumbers>
          <DataTable
            caption="Entry group share for first and repeat orders"
            rows={paired}
            rowKey={(r) => r.group}
            columns={[
              { header: 'Entry group', cell: (r) => r.group },
              { header: 'First orders', align: 'right', cell: (r) => formatCount(r.first) },
              { header: 'Share of first orders', align: 'right', cell: (r) => formatPercent(r.firstShare) },
              { header: 'Repeat orders', align: 'right', cell: (r) => formatCount(r.repeat) },
              { header: 'Share of repeat orders', align: 'right', cell: (r) => formatPercent(r.repeatShare) },
            ]}
          />
        </ShowNumbers>
      </Card>

      <Card
        title="How many pages they viewed"
        note="Orders grouped by pages viewed in the visit. Shares are of first orders (blue) and of repeat orders (grey) that have a page count."
      >
        <Legend items={LEGEND} />
        <PairedColumnChart
          label="Page count bands for first and repeat orders"
          rows={bands.rows.map((b) => ({ label: b.band, first: b.firstShare, repeat: b.repeatShare, firstCount: b.first, repeatCount: b.repeat }))}
        />
        {bands.withoutPages > 0 ? (
          <p className="muted small">
            {plural(bands.withoutPages, 'order has', 'orders have')} no page count and {bands.withoutPages === 1 ? 'is' : 'are'} not shown.
          </p>
        ) : null}
        <ShowNumbers>
          <DataTable
            caption="Page count bands"
            rows={bands.rows}
            rowKey={(r) => r.band}
            columns={[
              { header: 'Pages viewed', cell: (r) => r.band },
              { header: 'First orders', align: 'right', cell: (r) => formatCount(r.first) },
              { header: 'Share of first', align: 'right', cell: (r) => formatPercent(r.firstShare) },
              { header: 'Repeat orders', align: 'right', cell: (r) => formatCount(r.repeat) },
              { header: 'Share of repeat', align: 'right', cell: (r) => formatPercent(r.repeatShare) },
            ]}
          />
        </ShowNumbers>
      </Card>
    </div>
  );
}
