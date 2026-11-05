import { createContext, useContext } from 'react';
import { formatCents, formatCentsCompact } from './lib/money';

export interface Format {
  currency: string;
  money: (cents: number | null) => string;
  compactMoney: (cents: number) => string;
}

export function makeFormat(currency: string): Format {
  return {
    currency: currency.trim(),
    money: (cents) => (cents === null ? '–' : formatCents(cents, currency)),
    compactMoney: (cents) => formatCentsCompact(cents),
  };
}

export const FormatContext = createContext<Format>(makeFormat(''));

export function useFormat(): Format {
  return useContext(FormatContext);
}
