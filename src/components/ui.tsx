import { useId, type ReactNode } from 'react';

export function Card({
  title,
  note,
  children,
  actions,
  className = '',
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      <div className="card-head">
        <h3 id={id}>{title}</h3>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

export function HowCalculated({ children }: { children: ReactNode }) {
  return (
    <details className="how">
      <summary>How this is calculated</summary>
      <div className="how-body">{children}</div>
    </details>
  );
}

export function StatTile({
  label,
  value,
  sub,
  how,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  how?: ReactNode;
  tone?: 'warn' | 'ok';
}) {
  return (
    <div className={`tile${tone ? ` tile-${tone}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub ? <div className="tile-sub">{sub}</div> : null}
      {how ? <HowCalculated>{how}</HowCalculated> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <p className="empty-title">{title}</p>
      {children ? <div className="empty-body">{children}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ShareBar({ fraction, tone = 'first' }: { fraction: number; tone?: 'first' | 'repeat' }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span className="sharebar" aria-hidden="true">
      <span className={`sharebar-fill sharebar-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty = 'Nothing to show.',
  footer,
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  caption: string;
  empty?: string;
  footer?: ReactNode;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={`${c.align === 'right' ? 'num' : ''} ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey(r, ri)}>
              {columns.map((c, ci) => (
                <td key={ci} className={`${c.align === 'right' ? 'num' : ''} ${c.className ?? ''}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

export function Legend({ items }: { items: ReadonlyArray<{ label: string; tone: 'first' | 'repeat' }> }) {
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`swatch swatch-${i.tone}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** A collapsible table that gives the exact numbers behind a chart. */
export function ShowNumbers({ children }: { children: ReactNode }) {
  return (
    <details className="numbers">
      <summary>Show the numbers</summary>
      {children}
    </details>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  id,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  id?: string;
  hideLabel?: boolean;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={sid} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <select id={sid} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
