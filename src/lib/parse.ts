import Papa from 'papaparse';
import { ATTRIBUTION_COLUMNS, COL, REQUIRED_COLUMNS, missingColumns } from './columns';
import { firstPart, parseCount, repeatInfo, deviceNameFromUserAgent, type DeviceName } from './attribution';
import { parseOrderDate, parseSessionStart } from './dates';
import { parseMoneyToCents } from './money';
import { parseEntry, type EntryInfo } from './entry';
import { emailKey, redactEmails } from './privacy';

/**
 * One order, reduced to the fields the analysis needs.
 * It holds no email, city, state, or user agent text. The text it keeps can be shown on screen,
 * so anything that looks like an email in those cells is replaced as the file is read.
 */
export interface OrderRecord {
  /** 1-based position of the row in the file. */
  row: number;
  orderId: string;
  orderIdNum: number | null;
  status: string;
  /** Wall-clock seconds (no time zone applied), or null if the date could not be read. */
  dateSec: number | null;
  /** Opaque key derived from the trimmed, lowercased email. Never the email itself. */
  customerKey: string;
  hasEmail: boolean;
  totalCents: number | null;
  refundCents: number;
  sourceType: string;
  utmSource: string;
  entry: EntryInfo;
  pages: number | null;
  sessionCount: number | null;
  sessionStartSec: number | null;
  deviceType: string;
  deviceName: DeviceName;
}

export interface ColumnQuality {
  column: string;
  blank: number;
  repeated: number;
  differing: number;
}

/** Whole-file checks that need the raw cell text, gathered while reading. */
export interface RawQuality {
  rows: number;
  malformedRows: number;
  columns: ColumnQuality[];
  rowsWithRepeated: number;
  rowsWithDiffering: number;
  blankOrderIds: number;
  noEmail: number;
  unreadableTotals: number;
  unreadableRefunds: number;
  negativeRefunds: number;
  unreadableSessionStarts: number;
  unreadableEntries: number;
}

export interface ParseSuccess {
  ok: true;
  orders: OrderRecord[];
  quality: RawQuality;
  extraColumns: number;
}

export interface ParseFailure {
  ok: false;
  reason: 'empty' | 'missing-columns' | 'unreadable';
  missing: string[];
  message: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function cleanHeader(h: string): string {
  return stripBom(h).trim();
}

/** Parses CSV text into rows of strings. Nothing is converted to numbers here. */
export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[]; malformedRows: number } {
  const result = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    transformHeader: cleanHeader,
  });
  const badRows = new Set<number>();
  for (const e of result.errors) {
    if (typeof e.row === 'number') badRows.add(e.row);
  }
  return { headers: result.meta.fields ?? [], rows: result.data, malformedRows: badRows.size };
}

function cell(row: Record<string, string>, column: string): string {
  const v = row[column];
  return typeof v === 'string' ? v : '';
}

export function parseOrdersCsv(text: string): ParseResult {
  if (stripBom(text).trim() === '') {
    return { ok: false, reason: 'empty', missing: [], message: 'This file is empty.' };
  }
  let parsed: ReturnType<typeof parseCsvText>;
  try {
    parsed = parseCsvText(text);
  } catch {
    return { ok: false, reason: 'unreadable', missing: [], message: 'This file could not be read as a CSV.' };
  }
  const missing = missingColumns(parsed.headers);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'missing-columns',
      missing,
      message: `This file is missing ${missing.length} required column${missing.length === 1 ? '' : 's'}.`,
    };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, reason: 'empty', missing: [], message: 'This file has column names but no orders.' };
  }

  const columns: ColumnQuality[] = ATTRIBUTION_COLUMNS.map((column) => ({ column, blank: 0, repeated: 0, differing: 0 }));
  const quality: RawQuality = {
    rows: parsed.rows.length,
    malformedRows: parsed.malformedRows,
    columns,
    rowsWithRepeated: 0,
    rowsWithDiffering: 0,
    blankOrderIds: 0,
    noEmail: 0,
    unreadableTotals: 0,
    unreadableRefunds: 0,
    negativeRefunds: 0,
    unreadableSessionStarts: 0,
    unreadableEntries: 0,
  };

  const orders: OrderRecord[] = parsed.rows.map((row, i) => {
    let anyRepeated = false;
    let anyDiffering = false;
    for (const cq of columns) {
      const raw = cell(row, cq.column);
      if (firstPart(raw) === '') cq.blank += 1;
      const info = repeatInfo(raw);
      if (info.repeated) {
        cq.repeated += 1;
        anyRepeated = true;
      }
      if (info.differs) {
        cq.differing += 1;
        anyDiffering = true;
      }
    }
    if (anyRepeated) quality.rowsWithRepeated += 1;
    if (anyDiffering) quality.rowsWithDiffering += 1;

    const orderId = cell(row, COL.orderId).trim();
    if (!orderId) quality.blankOrderIds += 1;
    const key = emailKey(cell(row, COL.email));
    if (!key) quality.noEmail += 1;

    const totalCents = parseMoneyToCents(cell(row, COL.total));
    if (totalCents === null) quality.unreadableTotals += 1;
    const refundRaw = cell(row, COL.refund);
    let refundCents = 0;
    if (refundRaw.trim() !== '') {
      const parsedRefund = parseMoneyToCents(refundRaw);
      if (parsedRefund === null) quality.unreadableRefunds += 1;
      else refundCents = parsedRefund;
    }
    if (refundCents < 0) quality.negativeRefunds += 1;

    const sessionStartRaw = firstPart(cell(row, COL.sessionStart));
    const sessionStartSec = sessionStartRaw ? parseSessionStart(sessionStartRaw) : null;
    if (sessionStartRaw && sessionStartSec === null) quality.unreadableSessionStarts += 1;

    const entry = parseEntry(cell(row, COL.sessionEntry));
    if (entry.kind === 'unreadable') quality.unreadableEntries += 1;

    const idNum = /^\d+$/.test(orderId) ? Number(orderId) : null;

    return {
      row: i + 1,
      orderId,
      orderIdNum: idNum !== null && Number.isSafeInteger(idNum) ? idNum : null,
      status: redactEmails(cell(row, COL.status).trim()),
      dateSec: parseOrderDate(cell(row, COL.orderDate)),
      customerKey: key ?? `no-email-row-${i + 1}`,
      hasEmail: key !== null,
      totalCents,
      refundCents,
      sourceType: redactEmails(firstPart(cell(row, COL.sourceType))),
      utmSource: redactEmails(firstPart(cell(row, COL.utmSource))),
      entry,
      pages: parseCount(cell(row, COL.sessionPages)),
      sessionCount: parseCount(cell(row, COL.sessionCount)),
      sessionStartSec,
      deviceType: redactEmails(firstPart(cell(row, COL.deviceType))),
      deviceName: deviceNameFromUserAgent(firstPart(cell(row, COL.userAgent))),
    };
  });

  return { ok: true, orders, quality, extraColumns: Math.max(0, parsed.headers.length - REQUIRED_COLUMNS.length) };
}
