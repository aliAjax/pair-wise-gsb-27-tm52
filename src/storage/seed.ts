/**
 * 首次进入时的演示数据：用当前规则一次性算出明细并冻结存档。
 * 之后即使线路档位调整，这些记录也从存储中原样读出，不会重算。
 */

import { applyManualPrice, calculate } from "../rules/pricing";
import { findRoute, RULE_VERSION } from "../rules/catalog";
import type { FeeBreakdown, Quote, QuoteInput } from "../rules/types";

interface SeedSpec {
  customer: string;
  remark: string;
  status: Quote["status"];
  daysAgo: number;
  input: QuoteInput;
  /** 第二轮：手动改价（留痕演示） */
  manualTotal?: number;
  manualReason?: string;
}

const SPECS: SeedSpec[] = [
  {
    customer: "海沃商贸",
    remark: "月度框架客户，常规普货",
    status: "已报价",
    daysAgo: 2,
    input: { routeId: "sh-nj", actualWeight: 180, volume: 0.8, extraFee: 0 },
  },
  {
    customer: "云仓食品",
    remark: "协议客户，核价时申请协议价",
    status: "已核价",
    daysAgo: 1,
    input: { routeId: "hz-hf", actualWeight: 95, volume: 0.2, extraFee: 30 },
    manualTotal: 430,
    manualReason: "执行双方 9 月补充协议价（人工核减）",
  },
  {
    customer: "粤兴冷链",
    remark: "新客户试单，体积待最终测量",
    status: "草稿",
    daysAgo: 0,
    input: { routeId: "gz-cd", actualWeight: 120, volume: 1.1, extraFee: 0 },
  },
];

function isoDaysAgo(daysAgo: number, minutesOffset = 0): string {
  return new Date(Date.now() - daysAgo * 86400000 - minutesOffset * 60000).toISOString();
}

export function buildSeedQuotes(): Quote[] {
  return SPECS.map((spec, index) => {
    const rule = findRoute(spec.input.routeId);
    const first: FeeBreakdown = calculate(rule, spec.input, RULE_VERSION).fees;
    const createdAt = isoDaysAgo(spec.daysAgo, 40);
    const baseQuote: Quote = {
      id: `seed-${index + 1}`,
      customer: spec.customer,
      remark: spec.remark,
      status: spec.status,
      createdAt,
      updatedAt: createdAt,
      events: [
        { at: createdAt, action: "创建试算", operator: "系统", detail: "首次试算" },
      ],
      versions: [
        {
          version: 1,
          kind: spec.status === "草稿" ? "draft" : "system",
          reason: "首次试算",
          operator: "系统",
          createdAt,
          input: { ...spec.input },
          fees: first,
          frozen: spec.status !== "草稿",
        },
      ],
    };

    if (spec.manualTotal !== undefined) {
      const at = isoDaysAgo(spec.daysAgo, 10);
      const adjusted = applyManualPrice(first, spec.manualTotal);
      baseQuote.versions.push({
        version: 2,
        kind: "manual",
        reason: spec.manualReason ?? "人工改价",
        operator: "核价员林岚",
        createdAt: at,
        input: { ...spec.input },
        fees: adjusted,
        frozen: true,
      });
      baseQuote.events.push({
        at,
        action: "改价留痕",
        operator: "核价员林岚",
        detail: spec.manualReason,
      });
      baseQuote.updatedAt = at;
      if (spec.status === "已核价") {
        baseQuote.events.push({
          at: isoDaysAgo(spec.daysAgo, 5),
          action: "核价通过",
          operator: "核价员林岚",
        });
      }
    }

    return baseQuote;
  });
}
