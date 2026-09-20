/**
 * 应用状态层（Pinia）：
 * - 费用计算调用规则层纯函数；持久化调用存储层仓库；本层只编排流程
 * - 列表与状态流转一律读取最新版本；旧版本永久保留可查
 * - 旧记录只还原已冻结明细，绝不重新计算
 */

import { computed, ref, toRaw } from "vue";
import { defineStore } from "pinia";
import { applyManualPrice, calculate, diffFromPrevious } from "../rules/pricing";
import { findRoute, RULE_VERSION } from "../rules/catalog";
import { QUOTE_STATUSES } from "../rules/types";
import type {
  Quote,
  QuoteEvent,
  QuoteFilters,
  QuoteInput,
  QuoteStatus,
  QuoteVersion,
} from "../rules/types";
import { quoteRepository } from "./repository";
import { buildSeedQuotes } from "./seed";

const DEFAULT_FILTERS: QuoteFilters = { status: "全部", routeId: "全部", keyword: "" };

const STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  草稿: ["待核价"],
  待核价: ["已核价", "草稿"],
  已核价: ["已报价", "已失效"],
  已报价: ["已失效"],
  已失效: [],
};

const STATUS_ACTION_LABEL: Record<QuoteStatus, string> = {
  草稿: "提交核价",
  待核价: "核价通过",
  已核价: "对外报价",
  已报价: "标记失效",
  已失效: "—",
};

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return (globalThis.crypto?.randomUUID?.() ?? `q-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export const useQuoteStore = defineStore("quoteDesk", () => {
  const quotes = ref<Quote[]>([]);
  const filters = ref<QuoteFilters>({ ...DEFAULT_FILTERS });
  const hydrated = ref(false);

  // ---------- 初始化（只做一次，旧数据原样载入） ----------
  function hydrate() {
    if (hydrated.value) return;
    const stored = quoteRepository.loadQuotes();
    if (stored) {
      quotes.value = stored;
    } else {
      quotes.value = buildSeedQuotes();
      persistQuotes();
    }
    filters.value = quoteRepository.loadFilters() ?? { ...DEFAULT_FILTERS };
    hydrated.value = true;
  }

  function persistQuotes() {
    quoteRepository.saveQuotes(quotes.value);
  }

  function persistFilters() {
    quoteRepository.saveFilters(filters.value);
  }

  // ---------- 只读选择器 ----------
  /** 最新版本：列表与状态流转统一从这里取数 */
  function latestVersion(quote: Quote): QuoteVersion {
    return quote.versions[quote.versions.length - 1];
  }

  function getQuote(id: string): Quote | undefined {
    return quotes.value.find((item) => item.id === id);
  }

  const filteredQuotes = computed(() => {
    const { status, routeId, keyword } = filters.value;
    const word = keyword.trim().toLowerCase();
    return quotes.value.filter((quote) => {
      const latest = latestVersion(quote);
      if (status !== "全部" && quote.status !== status) return false;
      if (routeId !== "全部" && latest.fees.routeId !== routeId) return false;
      if (word && !quote.customer.toLowerCase().includes(word) && !quote.id.toLowerCase().includes(word)) {
        return false;
      }
      return true;
    });
  });

  const metrics = computed(() => {
    const total = quotes.value.length;
    const pricing = quotes.value.filter((q) => q.status === "已核价" || q.status === "已报价").length;
    const versions = quotes.value.reduce((sum, q) => sum + q.versions.length, 0);
    const amount = quotes.value.reduce((sum, q) => sum + latestVersion(q).fees.total, 0);
    return { total, pricing, versions, amount: Math.round(amount * 100) / 100 };
  });

  const statusCounts = computed(() =>
    QUOTE_STATUSES.map((status) => ({
      status,
      value: quotes.value.filter((q) => q.status === status).length,
    }))
  );

  function nextActions(status: QuoteStatus): QuoteStatus[] {
    return STATUS_TRANSITIONS[status];
  }

  function actionLabel(status: QuoteStatus): string {
    return STATUS_ACTION_LABEL[status];
  }

  // ---------- 写操作：全部生成事件，版本写入即不可变 ----------
  function pushEvent(quote: Quote, action: string, operator: string, detail?: string) {
    const event: QuoteEvent = { at: nowIso(), action, operator, detail };
    quote.events.push(event);
  }

  /** 创建草稿（草稿版本不冻结，可反复重算覆盖） */
  function createDraft(input: {
    customer: string;
    remark: string;
    input: QuoteInput;
  }): string {
    const rule = findRoute(input.input.routeId);
    const fees = calculate(rule, input.input, RULE_VERSION).fees;
    const at = nowIso();
    const quote: Quote = {
      id: newId(),
      customer: input.customer,
      remark: input.remark,
      status: "草稿",
      createdAt: at,
      updatedAt: at,
      versions: [
        {
          version: 1,
          kind: "draft",
          reason: "首次试算",
          operator: "业务员",
          createdAt: at,
          input: { ...input.input },
          fees,
          frozen: false,
        },
      ],
      events: [{ at, action: "创建试算", operator: "业务员" }],
    };
    quotes.value = [quote, ...quotes.value];
    persistQuotes();
    return quote.id;
  }

  /** 草稿改输入：用当前规则重算，覆盖唯一的草稿版本；已核价后不允许走这里 */
  function updateDraft(
    id: string,
    patch: { customer?: string; remark?: string; input: QuoteInput }
  ) {
    const quote = mustGet(id);
    if (quote.status !== "草稿") throw new Error("仅草稿可重新试算，核价后请走改价流程");
    const rule = findRoute(patch.input.routeId);
    const fees = calculate(rule, patch.input, RULE_VERSION).fees;
    const v = latestVersion(quote);
    if (v.frozen) throw new Error("草稿版本已冻结，不能覆盖");
    v.input = { ...patch.input };
    v.fees = fees;
    v.createdAt = nowIso();
    if (patch.customer !== undefined) quote.customer = patch.customer;
    if (patch.remark !== undefined) quote.remark = patch.remark;
    quote.updatedAt = nowIso();
    pushEvent(quote, "重新试算", "业务员");
    persistQuotes();
  }

  /** 提交核价：草稿/驳回后的草稿 → 待核价，草稿版本转为冻结的系统版本 */
  function submitForApproval(id: string, operator = "业务员") {
    const quote = mustGet(id);
    if (quote.status !== "草稿") throw new Error("仅草稿可以提交核价");
    const v = latestVersion(quote);
    v.kind = "system";
    v.frozen = true;
    v.reason = v.reason || "提交核价";
    quote.status = "待核价";
    quote.updatedAt = nowIso();
    pushEvent(quote, "提交核价", operator, `费用合计 ¥${v.fees.total.toFixed(2)}`);
    persistQuotes();
  }

  /**
   * 改价（留痕核心）：核价环节或报价后改价，必须填写原因。
   * - 折扣/费率/附加费变化：按规则层重算为新的系统版本
   * - 直接改合计：在自动试算口径之上挂 manualAdjustment
   * 上一版本原样保留，列表与状态自动切到新版本。
   */
  function revise(params: {
    id: string;
    reason: string;
    operator?: string;
    input?: QuoteInput;
    manualTotal?: number;
  }): number {
    const operator = params.operator ?? "核价员";
    const reason = params.reason?.trim();
    if (!reason) throw new Error("改价必须填写原因");

    const quote = mustGet(params.id);
    const prev = latestVersion(quote);
    if (!prev.frozen) throw new Error("上一版本未冻结，不能改价");

    const input = params.input ?? prev.input;
    const rule = findRoute(input.routeId);
    let fees = calculate(rule, input, RULE_VERSION).fees;
    if (params.manualTotal !== undefined) {
      fees = applyManualPrice(fees, params.manualTotal);
    }
    const diff = diffFromPrevious(prev.fees, fees);

    const next: QuoteVersion = {
      version: prev.version + 1,
      kind: params.manualTotal !== undefined ? "manual" : "system",
      reason,
      operator,
      createdAt: nowIso(),
      input: { ...input },
      fees,
      frozen: true,
    };
    quote.versions.push(next);
    quote.updatedAt = next.createdAt;
    pushEvent(
      quote,
      "改价留痕",
      operator,
      `v${next.version}：${reason}（合计 ¥${fees.total.toFixed(2)}，较上版 ${
        diff >= 0 ? "+" : ""
      }¥${diff.toFixed(2)}）`
    );
    persistQuotes();
    return next.version;
  }

  /** 状态流转：只允许沿预定义边移动；驳回回草稿会另起一个可编辑草稿版本 */
  function transition(id: string, target: QuoteStatus, operator = "核价员") {
    const quote = mustGet(id);
    const allowed = STATUS_TRANSITIONS[quote.status];
    if (!allowed.includes(target)) {
      throw new Error(`不能从「${quote.status}」流转到「${target}」`);
    }

    if (target === "草稿") {
      // 驳回：冻结版本保留，基于其输入派生一个新的草稿版本
      const prev = latestVersion(quote);
      const prevFees = toRaw(prev.fees);
      const draft: QuoteVersion = {
        version: prev.version + 1,
        kind: "draft",
        reason: "核价驳回，退回修改",
        operator,
        createdAt: nowIso(),
        input: { ...toRaw(prev.input) },
        fees: { ...prevFees },
        frozen: false,
      };
      quote.versions.push(draft);
      pushEvent(quote, "核价驳回", operator, "退回业务员修改");
    } else if (target === "已核价") {
      pushEvent(quote, "核价通过", operator, `以 v${latestVersion(quote).version} 费用明细冻结`);
    } else if (target === "已报价") {
      pushEvent(quote, "对外报价", operator, `报价 ¥${latestVersion(quote).fees.total.toFixed(2)}`);
    } else if (target === "已失效") {
      pushEvent(quote, "标记失效", operator);
    }

    quote.status = target;
    quote.updatedAt = nowIso();
    persistQuotes();
  }

  function remove(id: string) {
    quotes.value = quotes.value.filter((item) => item.id !== id);
    persistQuotes();
  }

  function setFilters(patch: Partial<QuoteFilters>) {
    filters.value = { ...filters.value, ...patch };
    persistFilters();
  }

  function resetFilters() {
    filters.value = { ...DEFAULT_FILTERS };
    persistFilters();
  }

  function mustGet(id: string): Quote {
    const quote = getQuote(id);
    if (!quote) throw new Error("报价单不存在或已被删除");
    return quote;
  }

  return {
    quotes,
    filters,
    filteredQuotes,
    metrics,
    statusCounts,
    hydrate,
    latestVersion,
    getQuote,
    nextActions,
    actionLabel,
    createDraft,
    updateDraft,
    submitForApproval,
    revise,
    transition,
    remove,
    setFilters,
    resetFilters,
  };
});
