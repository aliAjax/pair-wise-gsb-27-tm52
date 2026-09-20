/**
 * store 不变量验证：
 * - 核价冻结 v1，费用明细不可变
 * - 改价必须有原因、追加新版本，旧版本不重算/不覆盖
 * - 列表与筛选读取最新版本；关闭是终态
 */
import { setActivePinia, createPinia } from "pinia";
import { useQuoteStore } from "../src/stores/quoteStore";
import type { QuoteInput } from "../src/models/quote";

const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k)
  }
});

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}
function truthy(name: string, v: unknown) {
  if (v) pass++;
  else {
    fail++;
    console.error(`FAIL ${name} expected truthy, got ${JSON.stringify(v)}`);
  }
}

setActivePinia(createPinia());
const store = useQuoteStore();

// 种子：1 已核价（v1 冻结）+ 1 待核价草稿
check("seed total", store.stats.total, 2);
check("seed drafts", store.stats.drafts, 1);
check("seed priced", store.stats.priced, 1);

const draft = store.records.find((r) => r.status === "待核价")!;
truthy("seed draft has no versions", draft.versions.length === 0 && !!draft.draft);
const draftFeeBefore = draft.draft!.fees.total;

// 编辑草稿：可重算（改折扣 -> 费用变化）
store.saveDraft({ ...draft.draft!.input, discountRate: 0.8 }, draft.id);
truthy("draft recomputed on edit", draft.draft!.fees.total !== draftFeeBefore);
check("draft still no versions", draft.versions.length, 0);

// 核价：冻结 v1
store.approve(draft.id, "客户确认 8 折");
check("approved status", draft.status, "已核价");
check("approved v1", draft.versions.length, 1);
check("v1 kind", draft.versions[0]!.kind, "核价");
check("v1 reason", draft.versions[0]!.reason, "客户确认 8 折");
truthy("draft cleared", !draft.draft);
const v1Total = draft.versions[0]!.fees.total;

// 改价无原因 -> 抛错
let threw = false;
try {
  store.reprice(draft.id, { ...draft.versions[0]!.input, discountRate: 0.7 }, "  ");
} catch {
  threw = true;
}
truthy("reprice requires reason", threw);
check("no version added", draft.versions.length, 1);

// 改价：7 折 + 原因 -> 追加 v2
const newInput: QuoteInput = { ...draft.versions[0]!.input, discountRate: 0.7, remark: "签约月结" };
store.reprice(draft.id, newInput, "客户签约月结，协议 7 折");
check("reprice status", draft.status, "已改价");
check("v2 appended", draft.versions.length, 2);
check("v2 kind", draft.versions[1]!.kind, "改价");
check("v2 reason", draft.versions[1]!.reason, "客户签约月结，协议 7 折");
truthy("v2 cheaper", draft.versions[1]!.fees.total < v1Total);

// 旧版本 v1 不被覆盖、不重算
check("v1 frozen total", draft.versions[0]!.fees.total, v1Total);
check("v1 frozen discount", draft.versions[0]!.input.discountRate, 0.8);
check("v1 version no", draft.versions[0]!.version, 1);
check("v2 version no", draft.versions[1]!.version, 2);

// 列表/统计读取最新版本
const view = store.viewOf(draft);
check("list reads v2 total", view.fees.total, draft.versions[1]!.fees.total);
check("reprice count", store.stats.revisions, 1);

// 再次改价 v3
store.reprice(draft.id, { ...newInput, actualWeightKg: 120 }, "实际过磅 120kg");
check("v3 appended", draft.versions.length, 3);
check("list reads v3", store.viewOf(draft).current!.version, 3);
check("versions untouched", [
  draft.versions[0]!.fees.total,
  draft.versions[1]!.fees.total
], [v1Total, draft.versions[1]!.fees.total]);

// 筛选：线路
store.setFilter({ routeFilter: "HZ-HF", statusFilter: "ALL", keyword: "" });
truthy("route filter works", store.filteredViews.every((v) => v.input.routeCode === "HZ-HF"));
store.setFilter({ routeFilter: "ALL" });

// 筛选：状态
store.setFilter({ statusFilter: "已改价" });
check("status filter", store.filteredViews.length, 1);
check("status filter row", store.filteredViews[0]!.record.id, draft.id);
store.setFilter({ statusFilter: "ALL" });

// 关键字筛选（改价原因可搜到）
store.setFilter({ keyword: "月结" });
check("keyword hits reprice reason", store.filteredViews.length, 1);
store.setFilter({ keyword: "" });

// 关闭终态
const pricedSeed = store.records.find((r) => r.id === "seed-1")!;
store.close(pricedSeed.id);
check("closed status", pricedSeed.status, "已关闭");
// 已关闭不能改价
threw = false;
try {
  store.reprice(pricedSeed.id, pricedSeed.versions[0]!.input, "test");
} catch {
  threw = true;
}
truthy("closed cannot reprice", threw);

// 持久化：preferences 与 records 都写入
truthy("quotes persisted", mem.has("hxwl-quote-console:quotes:v1"));
const persisted = JSON.parse(mem.get("hxwl-quote-console:quotes:v1")!);
const persistedDraft = persisted.find((r: { id: string }) => r.id === draft.id);
check("persisted version chain length", persistedDraft.versions.length, 3);
check(
  "persisted old totals intact",
  persistedDraft.versions.map((v: { fees: { total: number } }) => v.fees.total),
  draft.versions.map((v) => v.fees.total)
);

// 新建草稿 -> 核价一条全新的单据
const fresh = store.saveDraft({
  customer: "测试客户",
  routeCode: "BJ-TJ",
  actualWeightKg: 60,
  volumeM3: 0.1,
  discountRate: 1
});
check("new record draft", fresh.status, "待核价");
store.approve(fresh.id, "");
check("new record approved", fresh.status, "已核价");
check("new record v1 reason default", fresh.versions[0]!.reason, "核价通过");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
