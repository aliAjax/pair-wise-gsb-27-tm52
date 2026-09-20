/**
 * 计价规则层：全部是无副作用纯函数，不读写存储、不碰界面。
 *
 * 计价口径（固定）：
 * 1. 体积重 = 体积(m³) × 每立方米折算公斤数（默认 200kg/m³）
 * 2. 计费重 = max(实重, 体积重)；低于线路起计重量时按起计重量
 * 3. 重量费按计费重命中的档位单价 × 计费重
 * 4. 折扣只作用于重量费
 * 5. 燃油附加费最后加，基数 = 折后重量费 + 其他附加费
 */

import type { FeeBreakdown, QuoteInput, RouteRule } from "./types";

/** 金额四舍五入到分，避免浮点尾差 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function findTier(rule: RouteRule, billingWeight: number) {
  const tier = rule.tiers.find(
    (item) => billingWeight >= item.minKg && billingWeight < item.maxKg
  );
  if (!tier) {
    throw new Error(`线路「${rule.name}」没有覆盖 ${billingWeight}kg 的重量档位`);
  }
  return tier;
}

export interface CalcResult {
  fees: FeeBreakdown;
}

/** 依据线路规则与输入试算，返回完整费用明细（调用方负责存档） */
export function calculate(
  rule: RouteRule,
  input: QuoteInput,
  ruleVersion: string
): CalcResult {
  if (input.actualWeight < 0 || input.volume < 0 || input.extraFee < 0) {
    throw new Error("实重、体积、附加费不能为负");
  }

  const volumetricWeight = round2(input.volume * rule.volumetricFactor);
  const rawBillingWeight = Math.max(input.actualWeight, volumetricWeight);
  const floorApplied = rawBillingWeight < rule.minChargeWeight;
  const billingWeight = Math.max(rawBillingWeight, rule.minChargeWeight);

  const tier = findTier(rule, billingWeight);
  const weightFee = round2(tier.unitPrice * billingWeight);

  const discountRate = input.discountRate ?? rule.defaultDiscountRate;
  const discountedWeightFee = round2(weightFee * discountRate);
  const discountAmount = round2(weightFee - discountedWeightFee);

  const fuelRate = input.fuelRate ?? rule.defaultFuelRate;
  const fuelBase = round2(discountedWeightFee + input.extraFee);
  const fuelSurcharge = round2(fuelBase * fuelRate);

  const total = round2(fuelBase + fuelSurcharge);

  return {
    fees: {
      ruleVersion,
      routeId: rule.id,
      routeName: rule.name,
      actualWeight: input.actualWeight,
      volume: input.volume,
      volumetricWeight,
      minChargeWeight: rule.minChargeWeight,
      floorApplied,
      billingWeight,
      tierLabel: tier.label,
      unitPrice: tier.unitPrice,
      weightFee,
      discountRate,
      discountAmount,
      discountedWeightFee,
      extraFee: input.extraFee,
      fuelRate,
      fuelSurcharge,
      manualAdjustment: 0,
      total,
    },
  };
}

/**
 * 手动改价：只允许调整合计金额（折扣只作用于重量费、燃油最后加的口径不变）。
 * 调整额 = 人工合计 - 自动合计，作为留痕字段写入新明细。
 */
export function applyManualPrice(
  fees: FeeBreakdown,
  manualTotal: number
): FeeBreakdown {
  if (Number.isNaN(manualTotal) || manualTotal < 0) {
    throw new Error("改价后金额必须为非负数字");
  }
  const total = round2(manualTotal);
  return {
    ...fees,
    manualAdjustment: round2(total - (fees.total - fees.manualAdjustment)),
    total,
  };
}

/** 改价后金额较上一版本合计的差额（正为加价、负为减价） */
export function diffFromPrevious(previous: FeeBreakdown, next: FeeBreakdown): number {
  return round2(next.total - previous.total);
}
