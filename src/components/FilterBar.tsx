import { useMemo } from 'react';
import { DEVICE_NAMES, deviceTypeLabel, sourceTypeLabel } from '../lib/attribution';
import { sortGroups } from '../lib/entry';
import { clearFilter, describeFilters, EMPTY_FILTERS, type Filters } from '../lib/filters';
import { CUSTOMER_TYPE_LABEL, type AnalyzedOrder, type CustomerType } from '../lib/sequence';
import { formatCount } from '../lib/stats';
import { dayKey } from '../lib/dates';

const ALL = '__all__';

function toValue(v: string | null): string {
  return v === null ? ALL : v;
}
function fromValue(v: string): string | null {
  return v === ALL ? null : v;
}

function countBy(orders: readonly AnalyzedOrder[], key: (o: AnalyzedOrder) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) m.set(key(o), (m.get(key(o)) ?? 0) + 1);
  return m;
}

export function FilterBar({
  orders,
  shown,
  filters,
  onChange,
}: {
  /** All counted orders (before filters), used to build the choices. */
  orders: readonly AnalyzedOrder[];
  shown: number;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const options = useMemo(() => {
    const sourceTypes = countBy(orders, (o) => o.sourceType);
    const deviceTypes = countBy(orders, (o) => o.deviceType);
    const deviceNames = countBy(orders, (o) => o.deviceName);
    const groups = countBy(orders, (o) => o.entryGroup);
    const byCount = (m: Map<string, number>) => [...m.keys()].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0));
    const dates = orders.flatMap((o) => (o.dateSec === null ? [] : [dayKey(o.dateSec)])).sort();
    return {
      sourceTypes: byCount(sourceTypes).map((v) => ({ value: v, label: sourceTypeLabel(v) })),
      deviceTypes: byCount(deviceTypes).map((v) => ({ value: v, label: deviceTypeLabel(v) })),
      deviceNames: DEVICE_NAMES.filter((d) => deviceNames.has(d)).map((v) => ({ value: v, label: v })),
      groups: sortGroups(groups.keys()).map((v) => ({ value: v, label: v })),
      minDate: dates[0] ?? '',
      maxDate: dates[dates.length - 1] ?? '',
    };
  }, [orders]);

  const active = describeFilters(filters);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const select = (
    id: string,
    label: string,
    value: string | null,
    opts: ReadonlyArray<{ value: string; label: string }>,
    key: keyof Filters,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={toValue(value)} onChange={(e) => set({ [key]: fromValue(e.target.value) } as Partial<Filters>)}>
        <option value={ALL}>All</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <section className="filters" aria-labelledby="filters-title">
      <div className="filters-head">
        <h2 id="filters-title" className="filters-title">
          Filters
        </h2>
        <p className="filters-count" aria-live="polite">
          Showing <strong>{formatCount(shown)}</strong> of {formatCount(orders.length)} counted orders
        </p>
      </div>
      <div className="filters-grid">
        <div className="field">
          <label htmlFor="f-from">From</label>
          <input
            id="f-from"
            type="date"
            value={filters.dateFrom ?? ''}
            min={options.minDate}
            max={options.maxDate}
            onChange={(e) => set({ dateFrom: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-to">To</label>
          <input
            id="f-to"
            type="date"
            value={filters.dateTo ?? ''}
            min={options.minDate}
            max={options.maxDate}
            onChange={(e) => set({ dateTo: e.target.value || null })}
          />
        </div>
        {select('f-source-type', 'Source type', filters.sourceType, options.sourceTypes, 'sourceType')}
        {select('f-device-type', 'Device type', filters.deviceType, options.deviceTypes, 'deviceType')}
        {select('f-device-name', 'Device', filters.deviceName, options.deviceNames, 'deviceName')}
        {select('f-group', 'Entry group', filters.entryGroup, options.groups, 'entryGroup')}
        {select(
          'f-customer',
          'Customer type',
          filters.customerType,
          (['first', 'repeat'] as CustomerType[]).map((t) => ({ value: t, label: CUSTOMER_TYPE_LABEL[t] })),
          'customerType',
        )}
      </div>
      <div className="filters-active">
        {active.length === 0 ? (
          <span className="muted">No filters on. Showing every counted order.</span>
        ) : (
          <>
            <span className="muted">Active:</span>
            <ul className="chips">
              {active.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => onChange(clearFilter(filters, a.key))}
                    aria-label={`Remove filter ${a.label}: ${a.value}`}
                  >
                    <span>
                      {a.label}: <strong>{a.value}</strong>
                    </span>
                    <span aria-hidden="true" className="chip-x">
                      ×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          className="button button-small filters-reset"
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={active.length === 0}
        >
          Reset filters
        </button>
      </div>
    </section>
  );
}
