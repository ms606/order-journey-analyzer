import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_ENTRY_RULES, GROUP_ORDER, sortGroups, type EntryRule } from './lib/entry';
import { applyFilters, EMPTY_FILTERS, type Filters } from './lib/filters';
import { ENTRY_PAGE_LABEL } from './lib/labels';
import { buildExportAggregates, EMPTY_DECISIONS, type Decisions } from './lib/exports';
import {
  buildItemOrders,
  canMatchByDetails,
  canMatchByNumber,
  EMPTY_ITEMS_MAPPING,
  matchOrders,
  productLandingSummary,
  summarizeMatches,
} from './lib/items';
import { parseCsvText, parseOrdersCsv, type OrderRecord, type RawQuality } from './lib/parse';
import { containsEmail } from './lib/privacy';
import { buildDataCheck } from './lib/quality';
import { analyzeOrders } from './lib/sequence';
import { formatCount } from './lib/stats';
import { defaultIncludedStatuses, sortStatuses } from './lib/status';
import { FormatContext, makeFormat } from './format';
import { FilterBar } from './components/FilterBar';
import { Tabs, type TabDef } from './components/Tabs';
import { EmptyState } from './components/ui';
import { PrivacyNote, UploadScreen, type LoadState } from './components/Upload';
import { DataCheckScreen } from './screens/DataCheck';
import { DecisionsScreen } from './screens/Decisions';
import { EntryPointsScreen } from './screens/EntryPoints';
import type { ItemsState } from './screens/ItemsPanel';
import { NewVsRepeatScreen } from './screens/NewVsRepeat';
import { OverviewScreen } from './screens/Overview';
import { SourcesDevicesScreen } from './screens/SourcesDevices';

type TabId = 'check' | 'overview' | 'entry' | 'newrepeat' | 'sources' | 'decisions';

const ALL_TABS: readonly TabDef<TabId>[] = [
  { id: 'check', label: 'Data check' },
  { id: 'overview', label: 'Overview' },
  { id: 'entry', label: ENTRY_PAGE_LABEL },
  { id: 'newrepeat', label: 'New vs repeat' },
  { id: 'sources', label: 'Sources and devices' },
  { id: 'decisions', label: 'Decisions' },
];

/**
 * Tab ids left out of this build, comma-separated, e.g. VITE_HIDDEN_TABS=sources,decisions.
 * Set only by the GitHub Pages workflow. Data check is the start screen, so it is never hidden.
 */
const HIDDEN_TABS = new Set((import.meta.env.VITE_HIDDEN_TABS ?? '').split(',').map((id) => id.trim()));
const TABS = ALL_TABS.filter((t) => t.id === 'check' || !HIDDEN_TABS.has(t.id));

/** Tabs where the global filters apply. */
const FILTERED_TABS: ReadonlySet<TabId> = new Set(['overview', 'entry', 'newrepeat', 'sources']);

interface LoadedData {
  fileName: string;
  orders: OrderRecord[];
  quality: RawQuality;
  extraColumns: number;
}

/** Lets the browser paint a loading state before a long synchronous step. */
const nextFrame = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [included, setIncluded] = useState<string[]>([]);
  const [rules, setRules] = useState<EntryRule[]>(() => [...DEFAULT_ENTRY_RULES]);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<TabId>('check');
  const [decisions, setDecisions] = useState<Decisions>(EMPTY_DECISIONS);
  const [currency, setCurrency] = useState('');
  const [items, setItems] = useState<ItemsState | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // A file dropped outside a drop zone would make the browser open it and leave this page.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setLoad({ status: 'loading', fileName: file.name });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setLoad({ status: 'error', fileName: file.name, message: 'This file could not be opened.', missing: [] });
      return;
    }
    await nextFrame();
    const result = parseOrdersCsv(text);
    if (!result.ok) {
      setLoad({ status: 'error', fileName: file.name, message: result.message, missing: result.missing });
      return;
    }
    setData({ fileName: file.name, orders: result.orders, quality: result.quality, extraColumns: result.extraColumns });
    setIncluded(defaultIncludedStatuses(sortStatuses(result.orders.map((o) => o.status))));
    setFilters(EMPTY_FILTERS);
    setItems(null);
    setItemsError(null);
    setTab('check');
    setLoad({ status: 'idle' });
  }, []);

  const loadItems = useCallback(async (file: File) => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const text = await file.text();
      await nextFrame();
      const parsed = parseCsvText(text);
      const headers = parsed.headers.filter((h) => h !== '');
      if (headers.length === 0 || parsed.rows.length === 0) {
        setItemsError(`${file.name}: this file has no rows to match.`);
      } else if (headers.some(containsEmail)) {
        // Column names are listed on screen, and these would be customer data.
        setItemsError(`${file.name}: the first row looks like data, not column names. Add a row of column names and try again.`);
      } else {
        setItems({ fileName: file.name, headers, rows: parsed.rows, mapping: EMPTY_ITEMS_MAPPING });
      }
    } catch {
      setItemsError(`${file.name}: this file could not be read as a CSV.`);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const clearData = () => {
    setData(null);
    setItems(null);
    setItemsError(null);
    setIncluded([]);
    setFilters(EMPTY_FILTERS);
    setTab('check');
    setLoad({ status: 'idle' });
    setConfirmClear(false);
  };

  const toggleStatus = useCallback((status: string, on: boolean) => {
    setIncluded((prev) => sortStatuses(on ? [...prev, status] : prev.filter((s) => s !== status)));
  }, []);

  // ----- derived data (pure functions from src/lib) -----
  const includedSet = useMemo(() => new Set(included), [included]);
  const analyzed = useMemo(() => (data ? analyzeOrders(data.orders, includedSet, rules) : []), [data, includedSet, rules]);
  const filtered = useMemo(() => applyFilters(analyzed, filters), [analyzed, filters]);
  const check = useMemo(() => (data ? buildDataCheck(data.orders, data.quality, analyzed) : null), [data, analyzed]);
  const allStatuses = useMemo(() => (data ? sortStatuses(data.orders.map((o) => o.status)) : []), [data]);
  const groups = useMemo(
    () => sortGroups([...GROUP_ORDER, ...customGroups, ...rules.map((r) => r.group.trim()).filter(Boolean)]),
    [customGroups, rules],
  );
  const aggregates = useMemo(() => (check ? buildExportAggregates(check, analyzed) : null), [check, analyzed]);

  const itemsBuild = useMemo(() => (items ? buildItemOrders(items.rows, items.mapping) : null), [items]);
  const itemsReady = items !== null && (canMatchByNumber(items.mapping) || canMatchByDetails(items.mapping));
  const matches = useMemo(
    () => (items && itemsBuild && itemsReady ? matchOrders(analyzed, itemsBuild.itemOrders, items.mapping) : null),
    [items, itemsBuild, itemsReady, analyzed],
  );
  const matchSummary = useMemo(() => (matches ? summarizeMatches(matches) : null), [matches]);
  const productLanding = useMemo(() => (matches ? productLandingSummary(filtered, matches) : null), [matches, filtered]);
  const productLandingStatus = !items ? 'no-file' : !itemsReady ? 'no-mapping' : !items.mapping.product ? 'no-product-column' : 'ready';

  const format = useMemo(() => makeFormat(currency), [currency]);
  const showFilters = FILTERED_TABS.has(tab);

  let screen: ReactNode = null;
  if (data && check) {
    if (tab === 'check') {
      screen = (
        <DataCheckScreen
          check={check}
          includedStatuses={included}
          onToggleStatus={toggleStatus}
          extraColumns={data.extraColumns}
          items={{
            items,
            loading: itemsLoading,
            error: itemsError,
            onFile: (f) => void loadItems(f),
            onMapping: (m) => setItems((prev) => (prev ? { ...prev, mapping: m } : prev)),
            onRemove: () => setItems(null),
            summary: matchSummary,
            build: itemsBuild
              ? {
                  rows: itemsBuild.rows,
                  rowsUsed: itemsBuild.rowsUsed,
                  itemOrders: itemsBuild.itemOrders.length,
                  unreadableDates: itemsBuild.unreadableDates,
                  unreadableTotals: itemsBuild.unreadableTotals,
                }
              : null,
          }}
        />
      );
    } else if (tab === 'decisions') {
      screen = (
        <DecisionsScreen
          decisions={decisions}
          onChange={setDecisions}
          allStatuses={allStatuses}
          includedStatuses={included}
          onToggleStatus={toggleStatus}
          rules={rules}
          currencyLabel={currency}
          aggregates={aggregates}
        />
      );
    } else if (analyzed.length === 0) {
      screen = (
        <EmptyState
          title="No orders are being counted"
          action={
            <button type="button" className="button button-primary" onClick={() => setTab('check')}>
              Choose statuses on Data check
            </button>
          }
        >
          Every order status is unticked on the Data check screen.
        </EmptyState>
      );
    } else if (filtered.length === 0) {
      screen = (
        <EmptyState
          title="No orders match these filters"
          action={
            <button type="button" className="button button-primary" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reset filters
            </button>
          }
        />
      );
    } else if (tab === 'overview') {
      screen = <OverviewScreen orders={filtered} />;
    } else if (tab === 'entry') {
      screen = (
        <EntryPointsScreen
          orders={filtered}
          rules={rules}
          groups={groups}
          onRulesChange={setRules}
          onAddGroup={(g) => setCustomGroups((prev) => (prev.includes(g) ? prev : [...prev, g]))}
          productLanding={productLanding}
          productLandingStatus={productLandingStatus}
        />
      );
    } else if (tab === 'newrepeat') {
      screen = <NewVsRepeatScreen orders={filtered} groups={groups} />;
    } else {
      screen = <SourcesDevicesScreen orders={filtered} />;
    }
  }

  return (
    <FormatContext.Provider value={format}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="brand">
          <h1>Order Journey Analyzer</h1>
          <p className="tagline">Review a WooCommerce order export and agree the reporting rules</p>
        </div>
        <div className="header-tools">
          <div className="field field-inline">
            <label htmlFor="currency">Currency label</label>
            <input
              id="currency"
              type="text"
              value={currency}
              maxLength={12}
              placeholder="optional, e.g. EUR"
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
          {data ? (
            confirmClear ? (
              <div className="confirm" role="group" aria-label="Confirm clearing the data">
                <span>Remove the loaded files and every figure from this page?</span>
                <button type="button" className="button button-danger" onClick={clearData} autoFocus>
                  Yes, clear data
                </button>
                <button type="button" className="button" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="button button-danger-outline" onClick={() => setConfirmClear(true)}>
                Clear data
              </button>
            )
          ) : null}
        </div>
      </header>

      <main id="main" className="main">
        {!data ? (
          <UploadScreen onFile={(f) => void loadFile(f)} state={load} onReset={() => setLoad({ status: 'idle' })} />
        ) : (
          <>
            <div className="file-bar">
              <span>
                <strong>{data.fileName}</strong> · {formatCount(data.orders.length)} rows · {formatCount(analyzed.length)} counted
                orders
              </span>
              <PrivacyNote compact />
            </div>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
              {showFilters && analyzed.length > 0 ? (
                <FilterBar orders={analyzed} shown={filtered.length} filters={filters} onChange={setFilters} />
              ) : null}
              {screen}
            </div>
          </>
        )}
      </main>
      <footer className="app-footer">
        Runs only in this browser. Nothing is sent over the network or stored; reloading the page clears everything.
      </footer>
    </FormatContext.Provider>
  );
}
