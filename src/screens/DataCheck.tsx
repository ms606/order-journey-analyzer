import { ATTRIBUTION_LABELS } from '../lib/columns';
import { dayKey, formatDayKey } from '../lib/dates';
import type { DataCheck as DataCheckData } from '../lib/quality';
import { formatCount, formatPercent, share } from '../lib/stats';
import { DEFAULT_EXCLUDED_STATUSES } from '../lib/status';
import { Card, DataTable, HowCalculated, StatTile } from '../components/ui';
import { ItemsPanel, type ItemsPanelProps } from './ItemsPanel';

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
    { label: 'Visit start times that could not be read', value: check.unreadableSessionStarts, how: 'Not M/D/YY H:MM or YYYY-MM-DD HH:MM:SS. These are left out of the session gap check.' },
    { label: 'Rows with the wrong number of columns', value: check.malformedRows, how: 'Rows where the CSV reader found more or fewer fields than there are column names.' },
    { label: 'Rows with a blank Order ID', value: check.blankOrderIds, how: 'Order ID is empty.' },
  ];

  return (
    <div className="screen">
      <p className="screen-intro">
        This screen always uses <strong>every row in the file</strong>. The filters on other screens do not apply here.
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
        title="Blank and repeated visit details"
        note="How often each visit detail is empty, and how often a cell holds several values joined by “|” (for example typein|typein). The app always uses the first value."
      >
        <div className="tiles tiles-compact">
          <StatTile label="Rows with repeated values" value={formatCount(check.rowsWithRepeated)} sub={formatPercent(share(check.rowsWithRepeated, check.rows))} how="Rows where at least one visit detail contains “|”." />
          <StatTile
            label="Rows where repeated values differ"
            value={formatCount(check.rowsWithDiffering)}
            sub={formatPercent(share(check.rowsWithDiffering, check.rows))}
            tone={check.rowsWithDiffering > 0 ? 'warn' : undefined}
            how="Rows where at least one repeated cell has parts that are not all the same, such as 12|15. The first part (12) is used."
          />
        </div>
        <DataTable
          caption="Blank and repeated values per visit detail"
          rows={check.columns}
          rowKey={(c) => c.column}
          columns={[
            {
              header: 'Visit detail',
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
      </Card>

      <Card title="Things to look at before loading" note="Unusual values that may need a rule in the reporting database.">
        <div className="tiles">
          <StatTile
            label="Orders with more than 200 pages"
            value={formatCount(check.over200Pages)}
            tone={check.over200Pages > 0 ? 'warn' : undefined}
            how="Pages viewed (first value) above 200, across all rows. Very high counts may be bots or long browsing sessions."
          />
          <StatTile
            label="Visit started more than a day before the order"
            value={formatCount(check.sessionGapOverDay)}
            sub={<span className="badge badge-warn">Time zone not confirmed</span>}
            how={
              <>
                Order Date minus visit start time, in minutes, above 1,440 (24 hours). Checked on{' '}
                {formatCount(check.sessionGapChecked)} rows where both times could be read. The two times may be recorded in
                different time zones, so this is only a count, not a time-to-purchase measure.
              </>
            }
          />
          <StatTile
            label="Repeat orders showing a visit count of 1"
            value={formatCount(check.repeatWithSessionCount1)}
            sub={`of ${formatCount(check.repeatOrders)} repeat orders`}
            how="Repeat orders come from matching emails, not from the visit count. This shows how many repeat orders still report a visit count of 1, which is why the visit count is not used to find repeat customers. Uses the counted statuses."
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

      <ItemsPanel {...items} />
    </div>
  );
}
