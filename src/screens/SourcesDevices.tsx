import { useMemo, useState } from 'react';
import { byMonth, ordersByMonthAndYear, summarizeBy, type GroupRow } from '../lib/aggregate';
import { DEVICE_NAMES, deviceTypeLabel, sourceLabel, sourceTypeLabel } from '../lib/attribution';
import { monthShortName } from '../lib/dates';
import type { AnalyzedOrder } from '../lib/sequence';
import { formatCount, formatMedian, formatPercent } from '../lib/stats';
import { useFormat } from '../format';
import { Card, DataTable, HowCalculated, ShareBar, type Column } from '../components/ui';
import { MonthColumnChart } from '../components/charts';
import { PAGES_LABEL, PAGES_NOTE } from '../lib/labels';

function useGroupColumns(firstHeader: string): Column<GroupRow>[] {
  const f = useFormat();
  return [
    { header: firstHeader, cell: (r) => r.label },
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
    { header: 'Median order total', align: 'right', cell: (r) => f.money(r.medianTotalCents) },
    { header: `Median ${PAGES_LABEL.toLowerCase()}`, align: 'right', cell: (r) => formatMedian(r.medianPages) },
  ];
}

export function SourcesDevicesScreen({ orders }: { orders: readonly AnalyzedOrder[] }) {
  const bySourceType = useMemo(() => summarizeBy(orders, (o) => o.sourceType, sourceTypeLabel), [orders]);
  const bySource = useMemo(() => summarizeBy(orders, (o) => o.utmSource, sourceLabel, { limit: 15 }), [orders]);
  const sourceCount = useMemo(() => new Set(orders.map((o) => o.utmSource)).size, [orders]);
  const byDevice = useMemo(() => summarizeBy(orders, (o) => o.deviceName, (k) => k, { order: DEVICE_NAMES }), [orders]);
  const byDeviceType = useMemo(() => summarizeBy(orders, (o) => o.deviceType, deviceTypeLabel), [orders]);
  const typeCols = useGroupColumns('Source type');
  const sourceCols = useGroupColumns('Source');
  const deviceCols = useGroupColumns('Device');
  const deviceTypeCols = useGroupColumns('Device type');

  return (
    <div className="screen">
      <Card title="By source type" note="How the visitor arrived, as recorded by WooCommerce. “Direct” means they typed the address or used a bookmark. Shares are of the orders shown.">
        <DataTable caption="Orders by source type" rows={bySourceType} rowKey={(r) => r.key} columns={typeCols} />
        <HowCalculated>
          Source type is the first value in the source type column. Net sales: order totals minus refunds. Medians use the
          middle order (the average of the two middle orders when there is an even number) and leave blanks out. {PAGES_NOTE}
        </HowCalculated>
      </Card>

      <Card
        title="Top 15 sources"
        note={`The site or campaign each order came from, exactly as recorded: “google” and “Google” would be listed separately. ${formatCount(sourceCount)} different sources in the orders shown. Shares are of all orders shown.`}
      >
        <DataTable caption="Orders by source, top 15" rows={bySource} rowKey={(r) => r.key} columns={sourceCols} />
      </Card>

      <Card title="By device" note="Worked out from the browser details: iPhone, iPad, Android, Mac, Windows, or Other.">
        <DataTable caption="Orders by device name" rows={byDevice} rowKey={(r) => r.key} columns={deviceCols} />
        <HowCalculated>
          The browser details are checked in this order: contains iPhone, iPad, Android, Macintosh (shown as Mac), Windows.
          Anything else, including blank, is Other. Newer iPads may report themselves as a Mac.
        </HowCalculated>
      </Card>
      <Card title="By device type" note="The device type WooCommerce recorded (for example Mobile, Tablet, Desktop).">
        <DataTable caption="Orders by device type" rows={byDeviceType} rowKey={(r) => r.key} columns={deviceTypeCols} />
      </Card>

      <SourceOverTime orders={orders} sourceTypes={bySourceType} />
    </div>
  );
}

function SourceOverTime({ orders, sourceTypes }: { orders: readonly AnalyzedOrder[]; sourceTypes: readonly GroupRow[] }) {
  const allSources = useMemo(() => summarizeBy(orders, (o) => o.utmSource, sourceLabel), [orders]);
  const options = useMemo(
    () => [
      ...sourceTypes.map((t) => ({ value: `type:${t.key}`, label: t.label, group: 'Source type' })),
      ...allSources.map((s) => ({ value: `source:${s.key}`, label: s.label, group: 'Source' })),
    ],
    [sourceTypes, allSources],
  );
  const [picked, setPicked] = useState('');
  const value = options.some((o) => o.value === picked) ? picked : (options[0]?.value ?? '');
  const selected = useMemo(() => {
    if (value.startsWith('type:')) {
      const k = value.slice(5);
      return orders.filter((o) => o.sourceType === k);
    }
    const k = value.slice(7);
    return orders.filter((o) => o.utmSource === k);
  }, [orders, value]);
  const allMonths = useMemo(() => byMonth(orders).map((m) => m.month), [orders]);
  const monthly = useMemo(() => {
    const counts = new Map(byMonth(selected).map((m) => [m.month, m]));
    return byMonth(orders).map((m) => ({ month: m.month, label: m.label, value: counts.get(m.month)?.orders ?? 0 }));
  }, [orders, selected]);
  const grid = useMemo(() => ordersByMonthAndYear(selected), [selected]);
  const label = options.find((o) => o.value === value)?.label ?? '';

  return (
    <Card
      title="One source over time"
      note="Pick a source type or a source to see its orders in each month and year."
      actions={
        <div className="field">
          <label htmlFor="source-pick">Source</label>
          <select id="source-pick" value={value} onChange={(e) => setPicked(e.target.value)}>
            {['Source type', 'Source'].map((group) => (
              <optgroup key={group} label={group}>
                {options
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      }
    >
      {allMonths.length === 0 ? (
        <p className="muted">No dated orders.</p>
      ) : (
        <>
          <MonthColumnChart data={monthly} label={`Orders by month for ${label}`} valueName="Orders" />
          <div className="table-wrap">
            <table className="year-grid">
              <caption className="visually-hidden">Orders by month and year for {label}</caption>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i} scope="col" className="num">
                      {monthShortName(i + 1)}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.map((y) => (
                  <tr key={y.year}>
                    <th scope="row">{y.year}</th>
                    {y.months.map((n, i) => (
                      <td key={i} className={`num${n === 0 ? ' muted' : ''}`}>
                        {formatCount(n)}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{formatCount(y.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
