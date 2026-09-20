/**
 * 状态编排层 —— 连接规则、存储与界面
 *
 * 不变量：
 * - 草稿（待核价）可反复编辑、按当前规则重算；核价后费用明细冻结为 v1
 * - 版本链只追加：改价必带原因、生成新版本；旧版本原样保留可查
 * - 列表、筛选、统计、状态流转全部读取「最新版本」（toView）
 * - 状态流转不产生费用版本；历史版本永不按当前规则重算
 */
import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import {
  loadPrefs,
  loadQuotes,
  newId,
  resetToSeed,
  savePrefs,
  saveQuotes
} from "../storage/repository";
import { priceQuote, PricingError } from "../rules/pricing";
import {
  ALL_STATUSES,
  STATUS_FLOW,
  toView,
  type LatestView,
  type QuoteInput,
  type QuoteRecord,
  type QuoteStatus
} from "../models/quote";

export class StoreError extends Error {}

export const useQuoteStore = defineStore("quoteConsole", () => {
  const records = ref<QuoteRecord[]>(loadQuotes());
  const prefs = ref(loadPrefs());

  // 任意变更即同步写回；刷新后记录、版本链与筛选保持一致。
  // sync 刷新保证同一次操作中的多次修改（如核价清 draft + 追加 v1）落盘为完整快照。
  watch(records, (value) => saveQuotes(value), { deep: true, flush: "sync" });
  watch(prefs, (value) => savePrefs(value), { deep: true, flush: "sync" });

  /** 最新口径视图，按最近更新倒序（列表/筛选/统计的唯一数据源） */
  const views = computed<LatestView[]>(() =>
    [...records.value]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toView)
  );

  const filteredViews = computed<LatestView[]>(() => {
    const keyword = prefs.value.keyword.trim().toLowerCase();
    return views.value.filter((view) => {
      if (prefs.value.routeFilter !== "ALL" && view.input.routeCode !== prefs.value.routeFilter) {
        return false;
      }
      if (prefs.value.statusFilter !== "ALL" && view.record.status !== prefs.value.statusFilter) {
        return false;
      }
      if (keyword) {
        const haystack =
          `${view.input.customer} ${view.input.remark ?? ""} ${view.reason}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  });

  const stats = computed(() => {
    const total = records.value.length;
    const drafts = records.value.filter((r) => r.status === "待核价").length;
    const priced = records.value.filter(
      (r) => r.status === "已核价" || r.status === "已改价"
    ).length;
    // 改价留痕次数 = 版本链中 kind=改价 的版本数
    const revisions = records.value.reduce(
      (sum, r) => sum + r.versions.filter((v) => v.kind === "改价").length,
      0
    );
    const amount = views.value.reduce((sum, view) => sum + view.fees.total, 0);
    return {
      total,
      drafts,
      priced,
      revisions,
      amount: Math.round(amount * 100) / 100
    };
  });

  const statusCounts = computed(() =>
    ALL_STATUSES.map((status) => ({
      status,
      value: records.value.filter((record) => record.status === status).length
    }))
  );

  function getById(id: string): QuoteRecord | undefined {
    return records.value.find((record) => record.id === id);
  }

  function viewOf(record: QuoteRecord): LatestView {
    return toView(record);
  }

  function operatorName(): string {
    return prefs.value.operator.trim() || "业务员";
  }

  /**
   * 新增草稿：按当前规则试算，单据为「待核价」，费用尚未冻结、可再编辑重算。
   */
  function saveDraft(input: QuoteInput, id?: string): QuoteRecord {
    const fees = priceQuote(input);
    const now = new Date().toISOString();

    if (id) {
      const record = getById(id);
      if (!record || record.status !== "待核价" || !record.draft) {
        throw new StoreError("只有待核价草稿可以编辑");
      }
      record.draft = { input: { ...input }, fees, updatedAt: now };
      record.updatedAt = now;
      return record;
    }

    const record: QuoteRecord = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      status: "待核价",
      draft: { input: { ...input }, fees, updatedAt: now },
      versions: []
    };
    records.value = [record, ...records.value];
    return record;
  }

  /**
   * 核价：把待核价草稿的试算结果冻结为 v1（kind=核价），
   * 此后该版本的输入与费用明细不可变；单据进入「已核价」。
   */
  function approve(id: string, note: string): QuoteRecord {
    const record = getById(id);
    if (!record) throw new StoreError("报价单不存在");
    if (record.status !== "待核价" || !record.draft) {
      throw new StoreError("当前单据不可核价");
    }
    const now = new Date().toISOString();
    record.versions.push({
      version: 1,
      kind: "核价",
      reason: note.trim() || record.draft.input.remark || "核价通过",
      operator: operatorName(),
      createdAt: now,
      input: { ...record.draft.input },
      // 冻结草稿试算结果，不再重算
      fees: { ...record.draft.fees }
    });
    record.draft = undefined;
    record.status = "已核价";
    record.updatedAt = now;
    return record;
  }

  /**
   * 改价：必须填写原因；按新输入与当前规则计价，追加新版本（不改写旧版本）。
   * 列表/筛选/统计随即读取新版本；旧报价仍可在版本链中查看。
   */
  function reprice(id: string, input: QuoteInput, reason: string): QuoteRecord {
    if (!reason.trim()) throw new StoreError("改价必须填写原因");
    const record = getById(id);
    if (!record) throw new StoreError("报价单不存在");
    if (record.status !== "已核价" && record.status !== "已改价") {
      throw new StoreError("只有已核价单据可以改价");
    }
    const fees = priceQuote(input);
    const now = new Date().toISOString();
    record.versions.push({
      version: record.versions.length + 1,
      kind: "改价",
      reason: reason.trim(),
      operator: operatorName(),
      createdAt: now,
      input: { ...input },
      fees
    });
    record.status = "已改价";
    record.updatedAt = now;
    return record;
  }

  /**
   * 关闭单据（终态）。
   * 待核价→已核价 只能走 approve（冻结 v1）；
   * 已核价→已改价 只能走 reprice（追加新版本）；
   * 因此通用状态流转只剩「关闭」，费用与版本链均不受影响。
   */
  function close(id: string): void {
    const record = getById(id);
    if (!record || record.status === "已关闭") return;
    record.status = "已关闭";
    record.updatedAt = new Date().toISOString();
  }

  function nextStatus(status: QuoteStatus): QuoteStatus | null {
    return STATUS_FLOW[status][0] ?? null;
  }

  /** 校验输入并返回可读错误（供界面在行内试算时复用） */
  function validate(input: QuoteInput): string | null {
    try {
      priceQuote(input);
      return null;
    } catch (error) {
      return error instanceof PricingError ? error.message : "试算失败";
    }
  }

  function remove(id: string): void {
    records.value = records.value.filter((record) => record.id !== id);
  }

  function resetAll(): void {
    records.value = resetToSeed();
  }

  function setFilter(patch: Partial<typeof prefs.value>): void {
    Object.assign(prefs.value, patch);
  }

  return {
    records,
    prefs,
    views,
    filteredViews,
    stats,
    statusCounts,
    getById,
    viewOf,
    saveDraft,
    approve,
    reprice,
    close,
    nextStatus,
    validate,
    remove,
    resetAll,
    setFilter
  };
});
