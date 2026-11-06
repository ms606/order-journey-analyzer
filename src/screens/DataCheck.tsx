import { ATTRIBUTION_LABELS } from '../lib/columns';
import { dayKey, formatDayKey } from '../lib/dates';
import {
  ENTRY_GROUP_LABEL,
  ENTRY_PAGE_LABEL,
  ENTRY_PAGE_NOTE,
  MINIMUM_LABEL,
  MINIMUM_NOTE,
  PAGES_LABEL,
  PAGES_NOTE,
  TIME_SINCE_ENTRY_LABEL,
  TWO_PLUS_VISITS_LABEL,
} from '../lib/labels';
import type { ByEntryGroup, DataCheck as DataCheckData } from '../lib/quality';
import { formatCount, formatPercent, share } from '../lib/stats';
import { DEFAULT_EXCLUDED_STATUSES } from '../lib/status';
import { Card, DataTable, HowCalculated, StatTile } from '../components/ui';
import { ItemsPanel, type ItemsPanelProps } from './ItemsPanel';

/** The group rows with the all-orders row at the end. Nothing at all when no orders are counted. */
function withTotal<T>(table: ByEntryGroup<T>): T[] {
  return table.rows.length === 0 ? [] : [...table.rows, table.total];
}

export function DataCheckScreen({
  check,
  includedStatuses,
  onToggleStatus,
  extraColumns,
  items,
}: {
  check: DataCheckData;
  includedStatuses: readonly string[];
  onToggleStatus: (status: string, include: boolean) => void;
  extraColumns: number;
  items: ItemsPanelProps;
}) {
  const range =
    check.firstDateSec !== null && check.lastDateSec !== null
      ? `${formatDayKey(dayKey(check.firstDateSec))} – ${formatDayKey(dayKey(check.lastDateSec))}`
      : 'No readable dates';
  const counted = check.statuses.filter((s) => includedStatuses.includes(s.status)).reduce((n, s) => n + s.count, 0);

  const otherChecks: Array<{ label: string; value: number; how: string; warnIfAbove?: number }> = [
    { label: 'Orders without an email', value: check.noEmail, how: 'Rows with a blank Billing Email Address. Each is treated as its own customer.' },
    { label: 'Order totals that could not be read', value: check.unreadableTotals, how: 'Blank or non-numeric Order Total. These count as 0 in net sales and are left out of medians.' },
    { label: 'Refund totals that could not be read', value: check.unreadableRefunds, how: 'Non-numeric Refund Total. These count as 0.' },
    { label: 'Refund totals below zero', value: check.negativeRefunds, how: 'Net sales subtracts Refund Total. A negative refund would add to sales, so check how refunds are exported.' },
    { label: 'Tracked entry times that could not be read', value: check.unreadableSessionStarts, how: `Not M/D/YY H:MM or YYYY-MM-DD HH:MM:SS. These are left out of ${TIME_SINCE_ENTRY_LABEL}.` },
    { label: 'Rows with the wrong number of columns', value: check.malformedRows, how: 'Rows where the CSV reader found more or fewer fields than there are column names.' },
    { label: 'Rows with a blank Order ID', value: check.blankOrderIds, how: 'Order ID is empty.' },
  ];

  return (
    <div className="screen">
      <p className="screen-intro">
        This screen uses <strong>every row in the file</strong>, unless a card says it uses the counted statuses. The filters on
        other screens do not apply here.
      </p>

      <div className="tiles">
        <StatTile label="Rows in file" value={formatCount(check.rows)} sub={extraColumns > 0 ? `${extraColumns} extra column${extraColumns === 1 ? '' : 's'} ignored` : undefined} how="Every order row in the CSV. Blank lines at the end are skipped." />
        <StatTile label="Order dates" value={<span className="tile-value-small">{range}</span>} how="Earliest and latest readable Order Date, read as M/D/YY H:MM exactly as written. No time zone is applied." />
        <StatTile
          label="Duplicate Order IDs"
          value={formatCount(check.duplicates.ids)}
          sub={check.duplicates.ids > 0 ? `on ${formatCount(check.duplicates.rows)} rows` : 'Every Order ID is unique'}
          tone={check.duplicates.ids > 0 ? 'warn' : 'ok'}
          how="Order IDs that appear on more than one row."
        />
        <StatTile
          label="Dates that could not be read"
          value={formatCount(check.failedDates)}
          tone={check.failedDates > 0 ? 'warn' : 'ok'}
          how="Order Date values that are not a real date in M/D/YY H:MM format, for example 2024-01-16 10:00 or 2/30/24 9:00. These orders are left out of monthly charts and date filters."
        />
      </div>

      <Card
        title="Which order statuses count"
        note={
          <>
            Tick the statuses that should count as real orders. Unticked statuses are left out of every other screen and of
            the first/repeat order sequence. Failed and cancelled are left out by default.
          </>
        }
      >
        <DataTable
          caption="Orders by status"
          rows={check.statuses}
          rowKey={(s) => s.status || '(blank)'}
          columns={[
            {
              header: 'Counts',
              cell: (s) => (
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={includedStatuses.includes(s.status)}
                  onChange={(e) => onToggleStatus(s.status, e.target.checked)}
                  aria-label={`Count ${s.label} orders`}
                />
              ),
            },
            {
              header: 'Status',
              cell: (s) => (
                <span>
                  {s.label}
                  {!s.known ? <span className="badge badge-warn">Not a standard status</span> : null}
                  {DEFAULT_EXCLUDED_STATUSES.includes(s.status) ? <span className="badge">Left out by default</span> : null}
                </span>
              ),
            },
            { header: 'Value in file', cell: (s) => <code>{s.status || '(blank)'}</code> },
            { header: 'Orders', align: 'right', cell: (s) => formatCount(s.count) },
            { header: 'Share of rows', align: 'right', cell: (s) => formatPercent(share(s.count, check.rows)) },
          ]}
        />
        <p className="muted small">
          Counting {formatCount(counted)} of {formatCount(check.rows)} rows.
        </p>
      </Card>

      <Card
        title="Blank and repeated tracking details"
        note="How often each tracking detail is empty, and how often a cell holds several values joined by “|” (for example typein|typein). The app always uses the first value."
      >
        <div className="tiles tiles-compact">
          <StatTile label="Rows with repeated values" value={formatCount(check.rowsWithRepeated)} sub={formatPercent(share(check.rowsWithRepeated, check.rows))} how="Rows where at least one tracking detail contains “|”." />
          <StatTile
            label="Rows where repeated values differ"
            value={formatCount(check.rowsWithDiffering)}
            sub={formatPercent(share(check.rowsWithDiffering, check.rows))}
            tone={check.rowsWithDiffering > 0 ? 'warn' : undefined}
            how="Rows where at least one repeated cell has parts that are not all the same, such as 12|15. The first part (12) is used."
          />
        </div>
        <DataTable
          caption="Blank and repeated values per tracking detail"
          rows={check.columns}
          rowKey={(c) => c.column}
          columns={[
            {
              header: 'Tracking detail',
              cell: (c) => (
                <span className="stack">
                  <span>{ATTRIBUTION_LABELS[c.column] ?? c.column}</span>
                  <code className="small">{c.column}</code>
                </span>
              ),
            },
            { header: 'Blank', align: 'right', cell: (c) => formatCount(c.blank) },
            { header: 'Blank share', align: 'right', cell: (c) => formatPercent(share(c.blank, check.rows)) },
            { header: 'Repeated', align: 'right', cell: (c) => formatCount(c.repeated) },
            { header: 'Repeated and different', align: 'right', cell: (c) => formatCount(c.differing) },
          ]}
        />
        <p className="muted small">
          {ENTRY_PAGE_LABEL}: {ENTRY_PAGE_NOTE}
        </p>
        <p className="muted small">
          {PAGES_LABEL}: {PAGES_NOTE}
        </p>
      </Card>

      <Card title="Things to look at before loading" note="Unusual values that may need a rule in the reporting database.">
        <div className="tiles">
          <StatTile
            label={`Orders with more than 200 ${PAGES_LABEL.toLowerCase()}`}
            value={formatCount(check.over200Pages)}
            tone={check.over200Pages > 0 ? 'warn' : undefined}
            how={`${PAGES_LABEL} (first value) above 200, across all rows. Very high counts may be bots or long browsing sessions. ${PAGES_NOTE}`}
          />
          <StatTile
            label="Repeat orders showing 1 tracked visit"
            value={formatCount(check.repeatWithSessionCount1)}
            sub={`of ${formatCount(check.repeatOrders)} repeat orders`}
            how={`Repeat orders come from matching emails, not from tracked visits. This shows how many repeat orders still report 1 tracked visit, which is why tracked visits are not used to find repeat customers. ${MINIMUM_NOTE} Uses the counted statuses.`}
          />
        </div>
        <DataTable
          caption="Other checks"
          rows={otherChecks}
          rowKey={(r) => r.label}
          columns={[
            { header: 'Check', cell: (r) => r.label },
            { header: 'Rows', align: 'right', cell: (r) => <span className={r.value > 0 ? 'text-warn' : undefined}>{formatCount(r.value)}</span> },
            { header: 'What it means', cell: (r) => <span className="muted">{r.how}</span> },
          ]}
        />
        <HowCalculated>
          Every count here uses all rows, whatever their status, except the repeat-order check, which needs the counted
          statuses to know which orders are repeats.
        </HowCalculated>
      </Card>

      <Card
        title={TIME_SINCE_ENTRY_LABEL}
        note={`How long before the order the ${ENTRY_PAGE_LABEL.toLowerCase()} was saved, by group. A long gap suggests the saved page and time come from an earlier visit. Uses the counted statuses.`}
        actions={<span className="badge badge-warn">Time zone not confirmed</span>}
      >
        <div className="has-total-row">
          <DataTable
            caption={`${TIME_SINCE_ENTRY_LABEL} by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
            rows={withTotal(check.timeSinceEntry)}
            rowKey={(r) => r.group}
            empty="No orders are being counted."
            columns={[
              { header: ENTRY_GROUP_LABEL, cell: (r) => r.group },
              { header: 'Counted orders', align: 'right', cell: (r) => formatCount(r.orders) },
              { header: 'With a tracked entry time', align: 'right', cell: (r) => formatCount(r.withEntryTime) },
              { header: 'Over 1 day', align: 'right', cell: (r) => formatCount(r.over1Day) },
              { header: 'Share over 1 day', align: 'right', cell: (r) => formatPercent(r.over1DayShare) },
              { header: 'Over 7 days', align: 'right', cell: (r) => formatCount(r.over7Days) },
              { header: 'Share over 7 days', align: 'right', cell: (r) => formatPercent(r.over7DaysShare) },
            ]}
          />
        </div>
        <HowCalculated>
          Order Date minus the tracked entry time, for counted orders where both can be read. Over 1 day means more than 1,440
          minutes and over 7 days means more than 10,080 minutes, so exactly 1 day or exactly 7 days does not count. Shares are
          of all counted orders in the group, including orders with no tracked entry time. The two times may be recorded in
          different time zones, so an order close to either limit could fall on the other side.
        </HowCalculated>
      </Card>

      <Card
        title={TWO_PLUS_VISITS_LABEL}
        note={`${MINIMUM_LABEL}: ${MINIMUM_NOTE} Uses the counted statuses.`}
        actions={<span className="badge badge-warn">{MINIMUM_LABEL}</span>}
      >
        <div className="has-total-row">
          <DataTable
            caption={`${TWO_PLUS_VISITS_LABEL} by ${ENTRY_GROUP_LABEL.toLowerCase()}`}
            rows={withTotal(check.trackedVisits)}
            rowKey={(r) => r.group}
            empty="No orders are being counted."
            columns={[
              { header: ENTRY_GROUP_LABEL, cell: (r) => r.group },
              { header: 'Counted orders', align: 'right', cell: (r) => formatCount(r.orders) },
              { header: `${TWO_PLUS_VISITS_LABEL} (minimum)`, align: 'right', cell: (r) => formatCount(r.twoPlusVisits) },
              { header: 'Share (minimum)', align: 'right', cell: (r) => formatPercent(r.share) },
            ]}
          />
        </div>
        <HowCalculated>
          Counted orders where the first tracked visits value is above 1, so 1|2|2 counts as 1. Shares are of all counted orders
          in the group, including orders with a blank value.
        </HowCalculated>
      </Card>

      <ItemsPanel {...items} />
    </div>
  );
}
