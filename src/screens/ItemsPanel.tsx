import { canMatchByDetails, canMatchByNumber, type ItemsMapping, type MatchSummary } from '../lib/items';
import type { ItemDateFormat } from '../lib/dates';
import { ENTRY_PAGE_LABEL } from '../lib/labels';
import { formatCount, formatPercent, share } from '../lib/stats';
import { Card, HowCalculated, Select, StatTile } from '../components/ui';
import { FileDrop } from '../components/Upload';

export interface ItemsState {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ItemsMapping;
}

export interface ItemsBuildInfo {
  rows: number;
  rowsUsed: number;
  itemOrders: number;
  unreadableDates: number;
  unreadableTotals: number;
}

export interface ItemsPanelProps {
  items: ItemsState | null;
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onMapping: (m: ItemsMapping) => void;
  onRemove: () => void;
  summary: MatchSummary | null;
  build: ItemsBuildInfo | null;
}

const NOT_USED = '';

const DATE_FORMATS: ReadonlyArray<{ value: ItemDateFormat; label: string }> = [
  { value: 'iso', label: 'Year first: 2024-01-16' },
  { value: 'mdy', label: 'Month first: 1/16/24 or 1/16/2024' },
  { value: 'dmy', label: 'Day first: 16/1/2024 or 16.1.2024' },
];

export function ItemsPanel({ items, loading, error, onFile, onMapping, onRemove, summary, build }: ItemsPanelProps) {
  const title = 'Optional: order items file';
  const note = `A second CSV from the shop’s own database, with the products in each order. It lets the ${ENTRY_PAGE_LABEL} screen check whether people bought the product on that page. It also stays on this computer.`;

  if (!items) {
    return (
      <Card title={title} note={note}>
        {loading ? (
          <div className="loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Reading the items file…
          </div>
        ) : (
          <FileDrop
            onFile={onFile}
            title="Drag the order items CSV here"
            hint="Any column names. You choose which column is which."
            buttonLabel="Choose items file"
            inputLabel="Order items CSV file"
          />
        )}
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
      </Card>
    );
  }

  const m = items.mapping;
  const columnOptions = [{ value: NOT_USED, label: 'Not used' }, ...items.headers.map((h) => ({ value: h, label: h }))];
  const set = (patch: Partial<ItemsMapping>) => onMapping({ ...m, ...patch });
  const ready = canMatchByNumber(m) || canMatchByDetails(m);

  return (
    <Card
      title={title}
      note={note}
      actions={
        <button type="button" className="button button-small" onClick={onRemove}>
          Remove items file
        </button>
      }
    >
      <p className="small">
        <strong>{items.fileName}</strong>: {formatCount(items.rows.length)} rows, {formatCount(items.headers.length)} columns.
        Choose which column holds each piece of information. Column contents are never shown.
      </p>
      <div className="mapping-grid">
        <Select label="Order number" value={m.orderNumber} onChange={(v) => set({ orderNumber: v })} options={columnOptions} />
        <Select label="Customer email" value={m.email} onChange={(v) => set({ email: v })} options={columnOptions} />
        <Select label="Order date" value={m.date} onChange={(v) => set({ date: v })} options={columnOptions} />
        <Select
          label="Date layout"
          value={m.dateFormat}
          onChange={(v) => set({ dateFormat: v as ItemDateFormat })}
          options={DATE_FORMATS}
        />
        <Select label="Order total" value={m.total} onChange={(v) => set({ total: v })} options={columnOptions} />
        <Select label="Product name or slug" value={m.product} onChange={(v) => set({ product: v })} options={columnOptions} />
      </div>

      {!ready ? (
        <div className="alert alert-info" role="status">
          Choose the order number column, or all three of email, date and order total, to start matching.
        </div>
      ) : summary && build ? (
        <>
          <div className="tiles" aria-live="polite">
            <StatTile
              label="Matched orders"
              value={formatCount(summary.matched)}
              sub={`${formatPercent(share(summary.matched, summary.orders))} · ${formatCount(summary.matchedByNumber)} by number, ${formatCount(summary.matchedByDetails)} by email, date and total`}
              tone="ok"
            />
            <StatTile label="Unmatched orders" value={formatCount(summary.unmatched)} sub={formatPercent(share(summary.unmatched, summary.orders))} />
            <StatTile
              label="Ambiguous orders"
              value={formatCount(summary.ambiguous)}
              sub="More than one possible match: not used"
              tone={summary.ambiguous > 0 ? 'warn' : undefined}
            />
          </div>
          <p className="muted small">
            Out of {formatCount(summary.orders)} counted orders (all of them, before filters). The items file grouped into{' '}
            {formatCount(build.itemOrders)} orders from {formatCount(build.rowsUsed)} of {formatCount(build.rows)} rows.
            {build.unreadableDates > 0 ? ` ${formatCount(build.unreadableDates)} dates could not be read with the chosen layout.` : ''}
            {build.unreadableTotals > 0 ? ` ${formatCount(build.unreadableTotals)} totals could not be read.` : ''}
          </p>
          {!m.product ? (
            <div className="alert alert-info" role="status">
              Choose the product name or slug column to compare products on the {ENTRY_PAGE_LABEL} screen.
            </div>
          ) : null}
        </>
      ) : null}
      <HowCalculated>
        <ol>
          <li>If an order number column is chosen, an order matches the items row with exactly the same order number.</li>
          <li>
            Otherwise (or if that number is not in the items file), it matches when the email (trimmed, lowercased), the
            calendar date and the order total in cents are all the same.
          </li>
          <li>If more than one order could match, the result is “ambiguous” and nothing is matched. The app never picks one.</li>
        </ol>
        Several rows with the same order number are treated as one order with several products.
      </HowCalculated>
    </Card>
  );
}
