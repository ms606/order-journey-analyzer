import { useMemo, useState } from 'react';
import { byMonth, ordersInMonth, overviewFigures, summarizeBy } from '../lib/aggregate';
import { sourceLabel, sourceTypeLabel } from '../lib/attribution';
import type { AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatPercent, plural } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, Legend, Select, ShareBar, ShowNumbers, StatTile } from '../components/ui';
import { MonthlySplitChart } from '../components/charts';

const SPLIT_LEGEND = [
  { label: 'First order in file', tone: 'first' as const },
  { label: 'Repeat order', tone: 'repeat' as const },
];

export function OverviewScreen({ orders }: { orders: readonly AnalyzedOrder[] }) {
  const f = useFormat();
  const fig = useMemo(() => overviewFigures(orders), [orders]);
  const months = useMemo(() => byMonth(orders), [orders]);
  const monthsWithOrders = months.filter((m) => m.orders > 0);
  const latest = monthsWithOrders[monthsWithOrders.length - 1]?.month ?? '';
  const [picked, setPicked] = useState<string>('');
  const month = monthsWithOrders.some((m) => m.month === picked) ? picked : latest;
  const monthOrders = useMemo(() => (month ? ordersInMonth(orders, month) : []), [orders, month]);
  const monthSources = useMemo(() => summarizeBy(monthOrders, (o) => o.utmSource, sourceLabel, { limit: 10 }), [monthOrders]);
  const monthTypes = useMemo(() => summarizeBy(monthOrders, (o) => o.sourceType, sourceTypeLabel), [monthOrders]);
  const undated = orders.filter((o) => o.dateSec === null).length;

  return (
    <div className="screen">
      <div className="tiles">
        <StatTile
          label="Orders"
          value={formatCount(fig.orders)}
          how="Counted orders that match the filters. Statuses are chosen on the Data check screen."
        />
        <StatTile
          label="Net sales"
          value={f.money(fig.netCents)}
          how="Sum of Order Total minus sum of Refund Total for these orders, added up in whole cents. A blank refund counts as 0. No currency is assumed unless you enter one at the top."
        />
        <StatTile
          label="Customers"
          value={formatCount(fig.customers)}
          how="Unique email addresses (trimmed and lowercased) among these orders. A person who used two emails counts twice. Orders without an email count as one customer each."
        />
        <StatTile
          label="Customers with 2+ orders"
          value={formatCount(fig.customersWith2Plus)}
          sub={fig.customers > 0 ? formatPercent(fig.customersWith2Plus / fig.customers) + ' of customers' : undefined}
          how="Customers shown here who have two or more counted orders anywhere in the file, even if some fall outside the filters. This matches how first and repeat orders are worked out."
        />
        <StatTile
          label="Repeat order share"
          value={formatPercent(fig.repeatShare)}
          sub={`${formatCount(fig.repeatOrders)} repeat · ${formatCount(fig.firstOrders)} first`}
          how="Repeat orders divided by all orders shown. For each email, counted orders are sorted by date (then order number). The earliest is the “first order in file”, the rest are repeat orders. This is worked out before filters, so a filter never turns a repeat order into a first one."
        />
      </div>

      <Card
        title="Orders by month"
        note="Each column is one month. Blue is customers’ first order in this file, grey is repeat orders. Customers who bought before the file starts will look new."
      >
        <Legend items={SPLIT_LEGEND} />
        {months.length > 0 ? <MonthlySplitChart data={months} kind="orders" label="Orders by month, first and repeat" /> : <p className="muted">No dated orders.</p>}
        {undated > 0 ? (
          <p className="muted small">
            {plural(undated, 'order', 'orders')} with an unreadable date {undated === 1 ? 'is' : 'are'} not shown.
          </p>
        ) : null}
        <ShowNumbers>
          <DataTable
            caption="Orders by month"
            rows={months}
            rowKey={(m) => m.month}
            columns={[
              { header: 'Month', cell: (m) => m.label },
              { header: 'First orders', align: 'right', cell: (m) => formatCount(m.firstOrders) },
              { header: 'Repeat orders', align: 'right', cell: (m) => formatCount(m.repeatOrders) },
              { header: 'All orders', align: 'right', cell: (m) => formatCount(m.orders) },
            ]}
          />
        </ShowNumbers>
      </Card>

      <Card title="Net sales by month" note="Order totals minus refunds, by the month the order was placed. Refunds are counted in the month of the original order.">
        <Legend items={SPLIT_LEGEND} />
        {months.length > 0 ? <MonthlySplitChart data={months} kind="net" label="Net sales by month, first and repeat" /> : <p className="muted">No dated orders.</p>}
        <ShowNumbers>
          <DataTable
            caption="Net sales by month"
            rows={months}
            rowKey={(m) => m.month}
            columns={[
              { header: 'Month', cell: (m) => m.label },
              { header: 'First orders', align: 'right', cell: (m) => f.money(m.firstNetCents) },
              { header: 'Repeat orders', align: 'right', cell: (m) => f.money(m.repeatNetCents) },
              { header: 'All orders', align: 'right', cell: (m) => f.money(m.netCents) },
            ]}
          />
        </ShowNumbers>
      </Card>

      <Card
        title="Top sources in a month"
        note="Pick a month to see where its orders came from. Shares are of that month’s orders."
        actions={
          monthsWithOrders.length > 0 ? (
            <Select
              label="Month"
              value={month}
              onChange={setPicked}
              options={[...monthsWithOrders].reverse().map((m) => ({ value: m.month, label: `${m.label} (${formatCount(m.orders)})` }))}
            />
          ) : null
        }
      >
        {monthOrders.length === 0 ? (
          <p className="muted">No orders in this month.</p>
        ) : (
          <div className="two-col">
            <div>
              <h4>By source</h4>
              <DataTable
                caption="Top sources in the selected month"
                rows={monthSources}
                rowKey={(r) => r.key}
                columns={[
                  { header: 'Source', cell: (r) => r.label },
                  { header: 'Orders', align: 'right', cell: (r) => formatCount(r.orders) },
                  {
                    header: 'Share',
                    align: 'right',
                    cell: (r) => (
                      <span className="share-cell">
                        <ShareBar fraction={r.share} />
                        {formatPercent(r.share)}
                      </span>
                    ),
                  },
                  { header: 'Net sales', align: 'right', cell: (r) => f.money(r.netCents) },
                ]}
              />
            </div>
            <div>
              <h4>By source type</h4>
              <DataTable
                caption="Source types in the selected month"
                rows={monthTypes}
                rowKey={(r) => r.key}
                columns={[
                  { header: 'Source type', cell: (r) => r.label },
                  { header: 'Orders', align: 'right', cell: (r) => formatCount(r.orders) },
                  {
                    header: 'Share',
                    align: 'right',
                    cell: (r) => (
                      <span className="share-cell">
                        <ShareBar fraction={r.share} />
                        {formatPercent(r.share)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
