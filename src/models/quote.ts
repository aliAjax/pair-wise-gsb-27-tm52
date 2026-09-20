/**
 * 领域模型 —— 报价单与版本链
 *
 * 一笔报价单（QuoteRecord）：
 * - 待核价：持有 draft（试算输入与费用），可反复编辑、按当前规则重算，尚未进版本链
 * - 核价：把 draft 快照冻结为 v1（kind=核价），版本链就此开始，费用明细此后不可变
 * - 改价：只能在版本链尾部追加新版本（kind=改价，必带原因），旧版本原样保留可查
 *
 * 列表、筛选、状态流转一律读取「最新版本」（待核价单读取其草稿试算）。
 */
import type { FeeBreakdown } from "../rules/pricing";

/** 单据状态 */
export type QuoteStatus = "待核价" | "已核价" | "已改价" | "已关闭";

/**
 * 状态流转：
 * - 待核价 --核价(冻结v1)--> 已核价，也可关闭/删除
 * - 已核价/已改价 --改价(追加新版本)--> 已改价；或关闭
 * - 已关闭为终态
 */
export const STATUS_FLOW: Record<QuoteStatus, QuoteStatus[]> = {
  待核价: ["已核价", "已关闭"],
  已核价: ["已改价", "已关闭"],
  已改价: ["已关闭"],
  已关闭: []
};

export const ALL_STATUSES: readonly QuoteStatus[] = ["待核价", "已核价", "已改价", "已关闭"];

/** 版本来源 */
export type VersionKind = "核价" | "改价";

export interface QuoteInput {
  customer: string;
  routeCode: string;
  actualWeightKg: number;
  volumeM3: number;
  /** 折扣率，1 = 无折扣，0.88 = 88 折；只作用于重量费 */
  discountRate: number;
  remark?: string;
}

/** 待核价草稿：核价前可编辑重算，不进版本链 */
export interface DraftQuote {
  input: QuoteInput;
  fees: FeeBreakdown;
  updatedAt: string;
}

export interface QuoteVersion {
  version: number;
  kind: VersionKind;
  /** 改价版本必填改价原因；核价版本为核价说明 */
  reason: string;
  operator: string;
  createdAt: string;
  /** 冻结的计价输入（旧版本只展示，绝不重算） */
  input: QuoteInput;
  /** 冻结的费用明细 */
  fees: FeeBreakdown;
}

export interface QuoteRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: QuoteStatus;
  /** 仅 status=待核价 时存在 */
  draft?: DraftQuote;
  /** 核价后不可变、改价只追加的版本链 */
  versions: QuoteVersion[];
}

/** 列表统一读取的「最新口径」 */
export interface LatestView {
  record: QuoteRecord;
  /** 草稿试算或最新版本的输入 */
  input: QuoteInput;
  /** 草稿试算或最新版本的费用明细 */
  fees: FeeBreakdown;
  /** null 表示尚是草稿（未核价冻结） */
  current: QuoteVersion | null;
  isDraft: boolean;
  /** 展示用：原因/说明、操作人、时间 */
  reason: string;
  operator: string;
  changedAt: string;
}

export function latestVersion(record: QuoteRecord): QuoteVersion | null {
  return record.versions.length ? record.versions[record.versions.length - 1]! : null;
}

/** 取一笔单的最新口径（列表/筛选/统计的唯一来源） */
export function toView(record: QuoteRecord): LatestView {
  const version = latestVersion(record);
  if (version) {
    return {
      record,
      input: version.input,
      fees: version.fees,
      current: version,
      isDraft: false,
      reason: version.reason,
      operator: version.operator,
      changedAt: version.createdAt
    };
  }
  const draft = record.draft!;
  return {
    record,
    input: draft.input,
    fees: draft.fees,
    current: null,
    isDraft: true,
    reason: draft.input.remark ?? "待核价草稿",
    operator: "草稿",
    changedAt: draft.updatedAt
  };
}
