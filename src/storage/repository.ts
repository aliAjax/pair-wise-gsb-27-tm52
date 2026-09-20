/**
 * 存储层 —— localStorage 仓储 + 种子数据
 *
 * 职责：
 * - 报价单 / 版本链的读写与持久化（刷新后记录、版本链一致）
 * - 筛选条件、操作人等界面偏好的持久化（刷新后筛选一致）
 * - 历史版本中的费用明细只原样读出，绝不按当前规则重算
 *
 * 不包含计价业务编排（见 stores），也不包含界面。
 */
import { priceQuote } from "../rules/pricing";
import type { QuoteInput, QuoteRecord, QuoteVersion } from "../models/quote";

const QUOTES_KEY = "hxwl-quote-console:quotes:v1";
const PREFS_KEY = "hxwl-quote-console:prefs:v1";

export interface StoredPrefs {
  routeFilter: string; // "ALL" 或线路 code
  statusFilter: string; // "ALL" 或状态名
  keyword: string;
  operator: string;
}

export const DEFAULT_PREFS: StoredPrefs = {
  routeFilter: "ALL",
  statusFilter: "ALL",
  keyword: "",
  operator: ""
};

/** 首次使用时的演示数据：一笔已核价（冻结 v1），一笔待核价（草稿） */
function buildSeed(): QuoteRecord[] {
  const pricedInput: QuoteInput = {
    customer: "海沃商贸",
    routeCode: "SH-NJ",
    actualWeightKg: 180,
    volumeM3: 0.6,
    discountRate: 1,
    remark: "常规干线货"
  };
  const pricedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const v1: QuoteVersion = {
    version: 1,
    kind: "核价",
    reason: "标准报价核价通过",
    operator: "王核价",
    createdAt: pricedAt,
    input: pricedInput,
    fees: priceQuote(pricedInput)
  };
  const priced: QuoteRecord = {
    id: "seed-1",
    createdAt: pricedAt,
    updatedAt: pricedAt,
    status: "已核价",
    versions: [v1]
  };

  const draftInput: QuoteInput = {
    customer: "云仓食品",
    routeCode: "HZ-HF",
    actualWeightKg: 95,
    volumeM3: 0.2,
    discountRate: 0.95,
    remark: "冷链温区待确认"
  };
  const draftAt = new Date(Date.now() - 1 * 86400000).toISOString();
  const draft: QuoteRecord = {
    id: "seed-2",
    createdAt: draftAt,
    updatedAt: draftAt,
    status: "待核价",
    draft: {
      input: draftInput,
      fees: priceQuote(draftInput),
      updatedAt: draftAt
    },
    versions: []
  };

  return [priced, draft];
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 读取报价单：原样返回。
 * 历史版本的费用明细只读出不重算，旧记录不随规则变化而改变。
 */
export function loadQuotes(): QuoteRecord[] {
  const raw = localStorage.getItem(QUOTES_KEY);
  if (!raw) {
    const seed = buildSeed();
    localStorage.setItem(QUOTES_KEY, JSON.stringify(seed));
    return seed;
  }
  const parsed = safeParse<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return (parsed as QuoteRecord[]).filter((record) => {
    if (!record || !Array.isArray(record.versions)) return false;
    // 有效单据：已进版本链，或持有待核价草稿
    return record.versions.length > 0 || !!record.draft;
  });
}

export function saveQuotes(records: QuoteRecord[]): void {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(records));
}

export function loadPrefs(): StoredPrefs {
  return { ...DEFAULT_PREFS, ...safeParse(localStorage.getItem(PREFS_KEY), {}) };
}

export function savePrefs(prefs: StoredPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function newId(): string {
  return `q-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/** 清空并恢复演示数据 */
export function resetToSeed(): QuoteRecord[] {
  localStorage.removeItem(QUOTES_KEY);
  return loadQuotes();
}
