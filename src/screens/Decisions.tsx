import { useId, useMemo, useState } from 'react';
import {
  CART_LABEL_OPTIONS,
  decisionsJson,
  ORDER_DETAIL_FIELDS,
  REPEAT_DEFINITION_OPTIONS,
  REPORT_FILTER_OPTIONS,
  rulesCsv,
  type Decisions,
  type ExportAggregates,
} from '../lib/exports';
import type { EntryRule } from '../lib/entry';
import { statusLabel } from '../lib/status';
import { downloadText } from '../download';
import { Card } from '../components/ui';

function toggle(list: readonly string[], key: string, on: boolean): string[] {
  return on ? (list.includes(key) ? [...list] : [...list, key]) : list.filter((k) => k !== key);
}

function CheckList({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      <div className="checks checks-grid">
        {options.map((o) => (
          <label key={o.key} className="check">
            <input type="checkbox" checked={selected.includes(o.key)} onChange={(e) => onChange(toggle(selected, o.key, e.target.checked))} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RadioList({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      <div className="checks">
        {options.map((o) => (
          <label key={o.key} className="check">
            <input type="radio" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NoteField({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId();
  return (
    <div className="field field-wide">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function DecisionsScreen({
  decisions,
  onChange,
  allStatuses,
  includedStatuses,
  onToggleStatus,
  rules,
  currencyLabel,
  aggregates,
}: {
  decisions: Decisions;
  onChange: (d: Decisions) => void;
  allStatuses: readonly string[];
  includedStatuses: readonly string[];
  onToggleStatus: (status: string, include: boolean) => void;
  rules: readonly EntryRule[];
  currencyLabel: string;
  aggregates: ExportAggregates | null;
}) {
  const set = (patch: Partial<Decisions>) => onChange({ ...decisions, ...patch });
  const [saved, setSaved] = useState<string | null>(null);
  const preview = useMemo(
    () =>
      decisionsJson({
        decisions,
        allStatuses,
        includedStatuses,
        rules,
        currencyLabel,
        aggregates,
        exportedAt: '(set when downloaded)',
      }),
    [decisions, allStatuses, includedStatuses, rules, currencyLabel, aggregates],
  );

  const exportJson = () => {
    const text = decisionsJson({ decisions, allStatuses, includedStatuses, rules, currencyLabel, aggregates, exportedAt: new Date().toISOString() });
    downloadText('journey-decisions.json', text, 'application/json');
    setSaved('journey-decisions.json');
  };
  const exportRules = () => {
    downloadText('entry_page_rules.csv', rulesCsv(rules), 'text/csv');
    setSaved('entry_page_rules.csv');
  };

  return (
    <div className="screen">
      <div className="alert alert-info">
        Decisions are not saved anywhere. Download them before you close or reload this page. The downloads contain rules,
        decisions and totals only, never customer details. Filters do not affect the downloads.
      </div>

      <Card title="Which statuses count as orders" note="Same setting as on the Data check screen.">
        <fieldset className="fieldset">
          <legend className="visually-hidden">Statuses that count</legend>
          <div className="checks checks-inline">
            {allStatuses.map((s) => (
              <label key={s || '(blank)'} className="check">
                <input type="checkbox" checked={includedStatuses.includes(s)} onChange={(e) => onToggleStatus(s, e.target.checked)} />
                <span>
                  {statusLabel(s)} <code className="small">{s || '(blank)'}</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card title="Filters the reports need">
        <CheckList legend="Tick every filter the reports should offer" options={REPORT_FILTER_OPTIONS} selected={decisions.reportFilters} onChange={(v) => set({ reportFilters: v })} />
      </Card>

      <Card title="How a repeat customer is defined">
        <RadioList
          legend="A repeat customer is…"
          name="repeat-definition"
          options={REPEAT_DEFINITION_OPTIONS}
          value={decisions.repeatDefinition}
          onChange={(v) => set({ repeatDefinition: v })}
        />
        <NoteField label="Notes on the repeat customer definition" value={decisions.repeatDefinitionNote} onChange={(v) => set({ repeatDefinitionNote: v })} />
      </Card>

      <Card title="How to label cart, checkout and account starts" note="Visits that began on /cart/, /checkout/ or /my-account/.">
        <RadioList legend="Label these starts as…" name="cart-label" options={CART_LABEL_OPTIONS} value={decisions.cartLabel} onChange={(v) => set({ cartLabel: v })} />
        <NoteField label="Notes on cart, checkout and account starts" value={decisions.cartLabelNote} onChange={(v) => set({ cartLabelNote: v })} />
      </Card>

      <Card title="Fields on the Order Detail page">
        <CheckList
          legend="Show these fields for each order"
          options={ORDER_DETAIL_FIELDS}
          selected={decisions.orderDetailFields}
          onChange={(v) => set({ orderDetailFields: v })}
        />
      </Card>

      <Card title="Notes">
        <NoteField label="Anything else agreed today" rows={5} value={decisions.notes} onChange={(v) => set({ notes: v })} />
        <p className="muted small">Email addresses typed here are replaced with “[email removed]” in the download.</p>
      </Card>

      <Card title="Download" note="Saved to this computer’s downloads folder.">
        <div className="button-row">
          <button type="button" className="button button-primary" onClick={exportJson}>
            Download journey-decisions.json
          </button>
          <button type="button" className="button" onClick={exportRules}>
            Download entry_page_rules.csv
          </button>
        </div>
        {saved ? (
          <p className="ok small" role="status">
            {saved} downloaded.
          </p>
        ) : null}
        <details className="numbers">
          <summary>Preview journey-decisions.json</summary>
          <pre className="preview">{preview}</pre>
        </details>
      </Card>
    </div>
  );
}
