/**
 * 计价规则层 —— 物流报价核价规则（纯函数，不依赖存储与界面）
 *
 * 规则口径：
 * 1. 体积重 = 体积(m³) × 200 kg/m³
 * 2. 计费重 = max(实重, 体积重)；低于线路起计重量时按起计重量
 * 3. 按线路分档（重量段）单价计重量费
 * 4. 折扣只作用于重量费
 * 5. 燃油附加费 = 折后重量费 × 燃油费率，在最后加总
 */

export const VOLUME_WEIGHT_FACTOR = 200; // 每立方米折算 200 公斤
/** 规则版本号：写入费用快照，规则将来调整时可区分报价依据的规则版本 */
export const RULES_VERSION = "2026-09-v1";

export type ChargeWeightBasis = "实重" | "体积重" | "起计重量";

export interface RouteTier {
  /** 本档上限（含），单位 kg */
  upToKg: number;
  /** 本档重量费单价，元/kg */
  unitPrice: number;
}

export interface RouteRule {
  code: string;
  name: string;
  /** 起计重量 kg，计费重低于该值按该值计 */
  minChargeWeightKg: number;
  /** 燃油附加费率，如 0.12 = 12%，最后加在折后重量费上 */
  fuelRate: number;
  /** 重量档位，按 upToKg 升序，超出最高档取最高档单价 */
  tiers: readonly RouteTier[];
}

export const ROUTES: readonly RouteRule[] = [
  {
    code: "SH-NJ",
    name: "上海-南京",
    minChargeWeightKg: 20,
    fuelRate: 0.12,
    tiers: [
      { upToKg: 100, unitPrice: 4.2 },
      { upToKg: 300, unitPrice: 3.9 },
      { upToKg: 1000, unitPrice: 3.6 },
      { upToKg: 100000, unitPrice: 3.3 }
    ]
  },
  {
    code: "HZ-HF",
    name: "杭州-合肥",
    minChargeWeightKg: 30,
    fuelRate: 0.14,
    tiers: [
      { upToKg: 100, unitPrice: 5.6 },
      { upToKg: 300, unitPrice: 5.2 },
      { upToKg: 1000, unitPrice: 4.8 },
      { upToKg: 100000, unitPrice: 4.5 }
    ]
  },
  {
    code: "GZ-SZ",
    name: "广州-深圳",
    minChargeWeightKg: 10,
    fuelRate: 0.1,
    tiers: [
      { upToKg: 50, unitPrice: 2.8 },
      { upToKg: 200, unitPrice: 2.5 },
      { upToKg: 1000, unitPrice: 2.2 },
      { upToKg: 100000, unitPrice: 2.0 }
    ]
  },
  {
    code: "BJ-TJ",
    name: "北京-天津",
    minChargeWeightKg: 20,
    fuelRate: 0.11,
    tiers: [
      { upToKg: 100, unitPrice: 3.2 },
      { upToKg: 500, unitPrice: 2.9 },
      { upToKg: 100000, unitPrice: 2.6 }
    ]
  }
];

/** 一次计价的输入 */
export interface PricingInput {
  routeCode: string;
  actualWeightKg: number;
  volumeM3: number;
  /** 折扣率，1 = 无折扣，0.88 = 88 折；只作用于重量费 */
  discountRate: number;
}

/** 冻结到报价版本上的费用明细（快照，旧版本永不重算） */
export interface FeeBreakdown {
  rulesVersion: string;
  routeCode: string;
  routeName: string;
  actualWeightKg: number;
  volumeM3: number;
  volumeWeightKg: number;
  minChargeWeightKg: number;
  chargeWeightKg: number;
  chargeWeightBasis: ChargeWeightBasis;
  tierLabel: string;
  unitPrice: number;
  weightFeeRaw: number;
  discountRate: number;
  weightFee: number;
  fuelRate: number;
  fuelSurcharge: number;
  total: number;
}

export class PricingError extends Error {}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function findRoute(routeCode: string): RouteRule {
  const route = ROUTES.find((item) => item.code === routeCode);
  if (!route) throw new PricingError(`未知线路：${routeCode}`);
  return route;
}

/** 体积重（kg）= 体积(m³) × 200 */
export function calcVolumeWeight(volumeM3: number): number {
  return round2(volumeM3 * VOLUME_WEIGHT_FACTOR);
}

/** 按计费重匹配重量档位 */
export function pickTier(weightKg: number, route: RouteRule): RouteTier {
  const sorted = [...route.tiers].sort((a, b) => a.upToKg - b.upToKg);
  return sorted.find((tier) => weightKg <= tier.upToKg) ?? sorted[sorted.length - 1]!;
}

function tierLabelOf(weightKg: number, route: RouteRule, tier: RouteTier): string {
  const sorted = [...route.tiers].sort((a, b) => a.upToKg - b.upToKg);
  const index = sorted.findIndex((item) => item.upToKg === tier.upToKg);
  if (index === sorted.length - 1 && index > 0 && weightKg > sorted[index - 1]!.upToKg) {
    return `${sorted[index - 1]!.upToKg}kg 以上`;
  }
  return `≤${tier.upToKg}kg`;
}

/**
 * 按规则试算一笔费用。
 * 仅在「新建 / 草稿编辑 / 改价生成新版本」时调用；
 * 历史版本只读取其冻结的 FeeBreakdown，不再调用本函数。
 */
export function priceQuote(input: PricingInput): FeeBreakdown {
  const route = findRoute(input.routeCode);
  const actual = Number(input.actualWeightKg);
  const volume = Number(input.volumeM3);
  const discount = Number(input.discountRate);

  if (!Number.isFinite(actual) || actual < 0) throw new PricingError("实重必须是非负数字");
  if (!Number.isFinite(volume) || volume < 0) throw new PricingError("体积必须是非负数字");
  if (!Number.isFinite(discount) || discount <= 0 || discount > 1) {
    throw new PricingError("折扣率需在 (0, 1] 之间");
  }

  const volumeWeight = calcVolumeWeight(volume);
  let charge = Math.max(actual, volumeWeight);
  let basis: ChargeWeightBasis = actual >= volumeWeight ? "实重" : "体积重";
  if (charge < route.minChargeWeightKg) {
    charge = route.minChargeWeightKg;
    basis = "起计重量";
  }

  const tier = pickTier(charge, route);
  const weightFeeRaw = round2(charge * tier.unitPrice);
  const weightFee = round2(weightFeeRaw * discount); // 折扣只作用于重量费
  const fuelSurcharge = round2(weightFee * route.fuelRate); // 燃油按折后重量费计
  const total = round2(weightFee + fuelSurcharge); // 燃油最后加

  return {
    rulesVersion: RULES_VERSION,
    routeCode: route.code,
    routeName: route.name,
    actualWeightKg: actual,
    volumeM3: round2(volume),
    volumeWeightKg: volumeWeight,
    minChargeWeightKg: route.minChargeWeightKg,
    chargeWeightKg: charge,
    chargeWeightBasis: basis,
    tierLabel: tierLabelOf(charge, route, tier),
    unitPrice: tier.unitPrice,
    weightFeeRaw,
    discountRate: discount,
    weightFee,
    fuelRate: route.fuelRate,
    fuelSurcharge,
    total
  };
}
