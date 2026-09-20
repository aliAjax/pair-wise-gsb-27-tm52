/**
 * 核价领域模型 —— 只描述数据结构，不依赖 Vue / localStorage。
 */

/** 线路重量档位：[minKg, maxKg)，末档 maxKg 为 Infinity */
export interface RouteTier {
  label: string;
  minKg: number;
  maxKg: number;
  /** 该档位重量单价（元/kg） */
  unitPrice: number;
}

export interface RouteRule {
  id: string;
  name: string;
  /** 起计重量：计费重低于该值时按该值计 */
  minChargeWeight: number;
  /** 体积重换算系数：kg / m³（每立方米折算公斤数） */
  volumetricFactor: number;
  /** 重量费档位，从低到高覆盖全部计费重 */
  tiers: RouteTier[];
  /** 默认折扣率，仅作用于重量费（0.9 = 90%） */
  defaultDiscountRate: number;
  /** 默认燃油附加费率，作用于「折后重量费 + 其他附加费」 */
  defaultFuelRate: number;
}

/** 一次试算的输入参数（也是版本链中可回溯的计价依据） */
export interface QuoteInput {
  routeId: string;
  /** 实重 kg */
  actualWeight: number;
  /** 体积 m³ */
  volume: number;
  /** 其他附加费（装卸、保险等，元） */
  extraFee: number;
  /** 折扣率，空值走线路默认 */
  discountRate?: number;
  /** 燃油费率，空值走线路默认 */
  fuelRate?: number;
}

/** 费用明细快照：核价冻结后原样保存，规则再怎么改都不重算 */
export interface FeeBreakdown {
  ruleVersion: string;
  routeId: string;
  routeName: string;
  actualWeight: number;
  volume: number;
  volumetricWeight: number;
  minChargeWeight: number;
  floorApplied: boolean;
  billingWeight: number;
  tierLabel: string;
  unitPrice: number;
  /** 档位原价重量费 */
  weightFee: number;
  discountRate: number;
  /** 折扣让出金额 = 重量费 - 折后重量费 */
  discountAmount: number;
  /** 折后重量费：折扣只作用于这一项 */
  discountedWeightFee: number;
  extraFee: number;
  fuelRate: number;
  /** 燃油附加费：最后加，基数为折后重量费 + 其他附加费 */
  fuelSurcharge: number;
  /** 手动改价相对自动试算的调整额（自动版本为 0） */
  manualAdjustment: number;
  /** 合计（手动版本可被人工覆盖） */
  total: number;
}

export type QuoteStatus = "草稿" | "待核价" | "已核价" | "已报价" | "已失效";

export type VersionKind = "draft" | "system" | "manual";

export interface QuoteVersion {
  version: number;
  kind: VersionKind;
  /** 改价原因（初算/提交核价可使用默认原因，改价必须手填） */
  reason: string;
  operator: string;
  createdAt: string;
  input: QuoteInput;
  fees: FeeBreakdown;
  /** 核价通过后冻结；冻结版本只允许查看 */
  frozen: boolean;
}

export interface QuoteEvent {
  at: string;
  action: string;
  operator: string;
  detail?: string;
}

export interface Quote {
  id: string;
  customer: string;
  remark: string;
  status: QuoteStatus;
  createdAt: string;
  updatedAt: string;
  versions: QuoteVersion[];
  events: QuoteEvent[];
}

export interface QuoteFilters {
  status: string;
  routeId: string;
  keyword: string;
}

export const QUOTE_STATUSES: QuoteStatus[] = ["草稿", "待核价", "已核价", "已报价", "已失效"];
