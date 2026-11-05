import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthRow } from '../lib/aggregate';
import { monthShortName } from '../lib/dates';
import { formatCount, formatPercent, formatPercentShort, niceTicks } from '../lib/stats';
import { useFormat } from '../format';

/** Chart colours. Blue marks first orders (and single-series bars); grey marks repeat orders. */
export const C = {
  first: '#2a78d6',
  repeat: '#8b8f96',
  surface: '#ffffff',
  grid: '#e6e9ee',
  axis: '#4a5360',
  text: '#1b1f24',
  cursor: 'rgba(42, 120, 214, 0.07)',
} as const;

const TICK = { fill: C.axis, fontSize: 13 };
const LABEL_STYLE = { fill: C.text, fontSize: 12.5, fontWeight: 500 };

function TooltipBox({ title, rows }: { title: string; rows: ReadonlyArray<{ label: string; value: string; tone?: 'first' | 'repeat' }> }) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="chart-tooltip-row">
          {r.tone ? <span className={`swatch swatch-${r.tone}`} aria-hidden="true" /> : null}
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number; index?: number };
  index?: number;
}

/** Month axis tick: "Jan" with the year under January and under the first month shown. */
function MonthTick(props: TickProps & { months: readonly string[] }) {
  const index = props.index ?? props.payload?.index ?? 0;
  const key = props.months[index];
  if (!key) return null;
  const [year, month] = key.split('-');
  const showYear = index === 0 || month === '01';
  return (
    <g transform={`translate(${Number(props.x ?? 0)},${Number(props.y ?? 0)})`}>
      <text dy={14} textAnchor="middle" fill={C.axis} fontSize={12}>
        {monthShortName(Number(month))}
      </text>
      {showYear ? (
        <text dy={30} textAnchor="middle" fill={C.text} fontSize={12} fontWeight={600}>
          {year}
        </text>
      ) : null}
    </g>
  );
}

/** Stacked monthly columns: first orders (blue) at the base, repeat orders (grey) on top. */
export function MonthlySplitChart({ data, kind, label }: { data: readonly MonthRow[]; kind: 'orders' | 'net'; label: string }) {
  const f = useFormat();
  const rows = data.map((m) => ({
    ...m,
    first: kind === 'orders' ? m.firstOrders : m.firstNetCents,
    repeat: kind === 'orders' ? m.repeatOrders : m.repeatNetCents,
    total: kind === 'orders' ? m.orders : m.netCents,
    totalText: kind === 'orders' ? formatCount(m.orders) : f.compactMoney(m.netCents),
  }));
  const fmt = (v: number) => (kind === 'orders' ? formatCount(v) : f.money(v));
  const showLabels = rows.length <= (kind === 'orders' ? 18 : 12);
  const months = rows.map((r) => r.month);
  const ticks = rows.every((r) => r.first >= 0 && r.repeat >= 0)
    ? niceTicks(Math.max(0, ...rows.map((r) => r.total)), 4, kind === 'orders')
    : undefined;
  return (
    <div className="chart" role="figure" aria-label={label}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 26, right: 8, left: 4, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="month"
            interval={0}
            height={44}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            tick={(p: TickProps) => <MonthTick {...p} months={months} />}
          />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={kind === 'orders' ? 44 : 60}
            allowDecimals={false}
            ticks={ticks}
            domain={ticks ? [0, ticks[ticks.length - 1] ?? 'auto'] : ['auto', 'auto']}
            interval={0}
            tickFormatter={(v: number) => (kind === 'orders' ? formatCount(v) : f.compactMoney(v))}
          />
          <Tooltip
            cursor={{ fill: C.cursor }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !r) return null;
              return (
                <TooltipBox
                  title={r.label}
                  rows={[
                    { label: 'First order in file', value: fmt(r.first), tone: 'first' },
                    { label: 'Repeat order', value: fmt(r.repeat), tone: 'repeat' },
                    { label: 'Total', value: fmt(r.total) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="first" stackId="m" fill={C.first} stroke={C.surface} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="repeat" stackId="m" fill={C.repeat} stroke={C.surface} strokeWidth={1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {showLabels ? <LabelList dataKey="totalText" position="top" style={LABEL_STYLE} /> : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface HBarRow {
  label: string;
  value: number;
  text: string;
  tooltip?: ReadonlyArray<{ label: string; value: string }>;
}

/** One-colour horizontal bars with the value written at the end of each bar. */
export function HBarChart({ rows, label, labelWidth = 200 }: { rows: readonly HBarRow[]; label: string; labelWidth?: number }) {
  const height = rows.length * 40 + 12;
  return (
    <div className="chart" role="figure" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={[...rows]} layout="vertical" margin={{ top: 4, right: 130, left: 4, bottom: 4 }} barCategoryGap="28%">
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="label" width={labelWidth} tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: C.cursor }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as HBarRow | undefined;
              if (!active || !r) return null;
              return <TooltipBox title={r.label} rows={r.tooltip ?? [{ label: 'Value', value: r.text }]} />;
            }}
          />
          <Bar dataKey="value" fill={C.first} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            <LabelList dataKey="text" position="right" style={LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface PairRow {
  label: string;
  first: number; // fraction 0..1
  repeat: number; // fraction 0..1
  firstCount: number;
  repeatCount: number;
}

/** Paired horizontal bars: first orders (blue) above repeat orders (grey) for each category. */
export function PairedHBarChart({ rows, label, labelWidth = 200 }: { rows: readonly PairRow[]; label: string; labelWidth?: number }) {
  const data = rows.map((r) => ({
    ...r,
    firstPct: r.first * 100,
    repeatPct: r.repeat * 100,
    firstText: formatPercent(r.first),
    repeatText: formatPercent(r.repeat),
  }));
  const height = rows.length * 62 + 12;
  return (
    <div className="chart" role="figure" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }} barCategoryGap="22%" barGap={2}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="label" width={labelWidth} tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: C.cursor }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !r) return null;
              return (
                <TooltipBox
                  title={r.label}
                  rows={[
                    { label: 'First orders', value: `${r.firstText} (${formatCount(r.firstCount)})`, tone: 'first' },
                    { label: 'Repeat orders', value: `${r.repeatText} (${formatCount(r.repeatCount)})`, tone: 'repeat' },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="firstPct" fill={C.first} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="firstText" position="right" style={LABEL_STYLE} />
          </Bar>
          <Bar dataKey="repeatPct" fill={C.repeat} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="repeatText" position="right" style={LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Paired columns for ordered bands (first = blue, repeat = grey), labelled with percentages. */
export function PairedColumnChart({ rows, label }: { rows: readonly PairRow[]; label: string }) {
  const data = rows.map((r) => ({
    ...r,
    firstPct: r.first * 100,
    repeatPct: r.repeat * 100,
    firstText: formatPercentShort(r.first),
    repeatText: formatPercentShort(r.repeat),
  }));
  return (
    <div className="chart" role="figure" aria-label={label}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 26, right: 8, left: 4, bottom: 8 }} barCategoryGap="24%" barGap={2}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            cursor={{ fill: C.cursor }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !r) return null;
              return (
                <TooltipBox
                  title={`${r.label} page${r.label === '1' ? '' : 's'}`}
                  rows={[
                    { label: 'First orders', value: `${formatPercent(r.first)} (${formatCount(r.firstCount)})`, tone: 'first' },
                    { label: 'Repeat orders', value: `${formatPercent(r.repeat)} (${formatCount(r.repeatCount)})`, tone: 'repeat' },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="firstPct" fill={C.first} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList dataKey="firstText" position="top" style={LABEL_STYLE} />
          </Bar>
          <Bar dataKey="repeatPct" fill={C.repeat} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList dataKey="repeatText" position="top" style={LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series monthly columns. */
export function MonthColumnChart({
  data,
  label,
  valueName,
}: {
  data: ReadonlyArray<{ month: string; label: string; value: number }>;
  label: string;
  valueName: string;
}) {
  const months = data.map((d) => d.month);
  const rows = data.map((d) => ({ ...d, text: d.value > 0 ? formatCount(d.value) : '' }));
  const showLabels = rows.length <= 24;
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.value)), 4, true);
  return (
    <div className="chart" role="figure" aria-label={label}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 24, right: 8, left: 4, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="month"
            interval={0}
            height={44}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            tick={(p: TickProps) => <MonthTick {...p} months={months} />}
          />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1] ?? 'auto']}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: C.cursor }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !r) return null;
              return <TooltipBox title={r.label} rows={[{ label: valueName, value: formatCount(r.value) }]} />;
            }}
          />
          <Bar dataKey="value" fill={C.first} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {showLabels ? <LabelList dataKey="text" position="top" style={LABEL_STYLE} /> : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
