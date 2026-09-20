/**
 * 线路计价规则目录（规则层）。
 * RULE_VERSION 随规则内容变化，写入每笔费用明细；
 * 即使日后改了档位价，旧记录因已冻结明细不会被重算。
 */

import type { RouteRule } from "./types";

export const RULE_VERSION = "2026-09-01";

/** 体积重标准：每立方米 200 公斤 */
export const VOLUMETRIC_FACTOR = 200;

function tier(label: string, minKg: number, maxKg: number, unitPrice: number) {
  return { label, minKg, maxKg, unitPrice };
}

export const ROUTE_RULES: RouteRule[] = [
  {
    id: "sh-nj",
    name: "上海—南京",
    minChargeWeight: 100,
    volumetricFactor: VOLUMETRIC_FACTOR,
    defaultDiscountRate: 0.9,
    defaultFuelRate: 0.08,
    tiers: [
      tier("轻货档 0–300kg", 0, 300, 4.2),
      tier("普货档 300–1000kg", 300, 1000, 3.6),
      tier("重货档 1000kg 以上", 1000, Infinity, 2.9),
    ],
  },
  {
    id: "hz-hf",
    name: "杭州—合肥",
    minChargeWeight: 80,
    volumetricFactor: VOLUMETRIC_FACTOR,
    defaultDiscountRate: 0.88,
    defaultFuelRate: 0.1,
    tiers: [
      tier("轻货档 0–200kg", 0, 200, 5.1),
      tier("普货档 200–800kg", 200, 800, 4.4),
      tier("重货档 800kg 以上", 800, Infinity, 3.5),
    ],
  },
  {
    id: "gz-cd",
    name: "广州—成都",
    minChargeWeight: 150,
    volumetricFactor: VOLUMETRIC_FACTOR,
    defaultDiscountRate: 0.85,
    defaultFuelRate: 0.12,
    tiers: [
      tier("轻货档 0–500kg", 0, 500, 6.8),
      tier("普货档 500–1500kg", 500, 1500, 5.9),
      tier("重货档 1500kg 以上", 1500, Infinity, 4.8),
    ],
  },
  {
    id: "bj-xa",
    name: "北京—西安",
    minChargeWeight: 120,
    volumetricFactor: VOLUMETRIC_FACTOR,
    defaultDiscountRate: 0.92,
    defaultFuelRate: 0.09,
    tiers: [
      tier("轻货档 0–400kg", 0, 400, 5.6),
      tier("普货档 400–1200kg", 400, 1200, 4.9),
      tier("重货档 1200kg 以上", 1200, Infinity, 4.0),
    ],
  },
];

export function findRoute(routeId: string): RouteRule {
  const rule = ROUTE_RULES.find((item) => item.id === routeId);
  if (!rule) throw new Error(`未知线路：${routeId}`);
  return rule;
}
