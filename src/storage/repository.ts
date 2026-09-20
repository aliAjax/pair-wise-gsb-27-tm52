/**
 * 存储层：只管序列化 / 反序列化 / 持久化，不做计价与状态判断。
 * 读出的费用明细原样返回，绝不根据当前规则重算（旧记录不重算）。
 */

import type { Quote, QuoteFilters } from "../rules/types";

const QUOTES_KEY = "hxwlfront-13-quotes-v1";
const FILTERS_KEY = "hxwlfront-13-filters-v1";

export interface PersistedState {
  quotes: Quote[];
  filters: QuoteFilters;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const quoteRepository = {
  loadQuotes(): Quote[] | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(QUOTES_KEY);
    if (raw === null) return null;
    const parsed = safeParse<Quote[] | null>(raw, null);
    return Array.isArray(parsed) ? parsed : null;
  },

  saveQuotes(quotes: Quote[]): void {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
  },

  loadFilters(): QuoteFilters | null {
    const raw = localStorage.getItem(FILTERS_KEY);
    return safeParse<QuoteFilters | null>(raw, null);
  },

  saveFilters(filters: QuoteFilters): void {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  },
};
