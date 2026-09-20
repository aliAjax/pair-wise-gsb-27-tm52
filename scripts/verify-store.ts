/**
 * 存储层 / store 流程测试：用内存版 localStorage 模拟刷新。
 * 运行：npx esbuild 打包后 node 执行。
 */
import { createPinia, setActivePinia } from "pinia";
import { useQuoteStore } from "../src/storage/store";

// ---- 内存 localStorage 桩 ----
const mem = new Map<string, string>();
(globalThis as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  clear: () => mem.clear(),
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  key: (i: number) => [...mem.keys()][i] ?? null,
  removeItem: (k: string) => void mem.delete(k),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra}`);
  }
}

// ---- 首次进入：种子数据落盘 ----
setActivePinia(createPinia());
let store = useQuoteStore();
store.hydrate();
check("首次载入3条种子", store.quotes.length === 3);
const seededTotal = JSON.stringify(store.quotes.map((q) => q.versions.length));

// ---- 新建草稿 ----
const id = store.createDraft({
  customer: "测试客户",
  remark: "",
  input: { routeId: "sh-nj", actualWeight: 60, volume: 0.1, extraFee: 0 },
});
let q = store.getQuote(id)!;
check("新单为草稿", q.status === "草稿");
check("新单触发起计重量100", store.latestVersion(q).fees.billingWeight === 100);

// 草稿改输入：覆盖同一版本，不新增
store.updateDraft(id, {
  input: { routeId: "sh-nj", actualWeight: 200, volume: 0.1, extraFee: 20 },
});
q = store.getQuote(id)!;
check("重算仍1个版本", q.versions.length === 1);
check("重算后计费重200", store.latestVersion(q).fees.billingWeight === 200);

// ---- 提交核价：版本冻结 ----
store.submitForApproval(id);
q = store.getQuote(id)!;
check("提交后待核价", q.status === "待核价");
check("提交后版本冻结", store.latestVersion(q).frozen === true);

// 冻结后不能走草稿重算
let blocked = false;
try {
  store.updateDraft(id, {
    input: { routeId: "sh-nj", actualWeight: 201, volume: 0.1, extraFee: 0 },
  });
} catch {
  blocked = true;
}
check("冻结后拒绝草稿重算", blocked);

// ---- 改价不写原因被拒 ----
blocked = false;
try {
  store.revise({ id, reason: "   " });
} catch {
  blocked = true;
}
check("改价无原因被拒", blocked);

// ---- 改价：改折扣率（仅重量费），生成 v2 ----
const v1Total = store.latestVersion(q).fees.total;
store.revise({
  id,
  reason: "客户月发货量达标，按协议下调折扣",
  input: {
    routeId: "sh-nj",
    actualWeight: 200,
    volume: 0.1,
    extraFee: 20,
    discountRate: 0.8,
    fuelRate: 0.08,
  },
});
q = store.getQuote(id)!;
check("改价后2个版本", q.versions.length === 2);
const v2 = store.latestVersion(q);
check("v2为系统重算版本", v2.kind === "system" && v2.version === 2);
check("v2金额低于v1", v2.fees.total < v1Total, `v1=${v1Total} v2=${v2.fees.total}`);
check("v2原因已留痕", v2.reason.includes("协议"));
check("v1原样可查", q.versions[0].fees.total === v1Total);

// 手动改合计
store.revise({
  id,
  reason: "大客户一口价",
  manualTotal: 600,
});
q = store.getQuote(id)!;
const v3 = store.latestVersion(q);
check("手动改价v3合计600", v3.fees.total === 600);
check("v3标记人工调整", v3.fees.manualAdjustment !== 0 && v3.kind === "manual");

// ---- 列表读取最新版本：路由筛选 v3 仍为 sh-nj ----
check("列表可见且为待核价", store.filteredQuotes.some((x) => x.id === id));
store.setFilters({ status: "已报价" });
check("状态筛选不含待核价单", !store.filteredQuotes.some((x) => x.id === id));
store.resetFilters();

// ---- 核价通过 → 对外报价 ----
store.transition(id, "已核价");
store.transition(id, "已报价");
q = store.getQuote(id)!;
check("流转到已报价", q.status === "已报价");

// ---- 驳回路径：待核价可驳回到草稿并派生可编辑版本 ----
const id2 = store.createDraft({
  customer: "驳回测试",
  remark: "",
  input: { routeId: "bj-xa", actualWeight: 50, volume: 0.1, extraFee: 0 },
});
store.submitForApproval(id2);
store.transition(id2, "草稿", "核价员");
q = store.getQuote(id2)!;
check("驳回后回草稿", q.status === "草稿");
check("驳回派生新版本", q.versions.length === 2);
check("驳回版本未冻结可改", store.latestVersion(q).frozen === false);
store.updateDraft(id2, {
  input: { routeId: "bj-xa", actualWeight: 300, volume: 0.1, extraFee: 0 },
});
check("驳回草稿可重算", store.latestVersion(q).fees.billingWeight === 300);

// 非法流转被拒
blocked = false;
try {
  store.transition(id, "草稿"); // 已报价 → 草稿 非法
} catch {
  blocked = true;
}
check("非法流转被拒", blocked);

// ---- 模拟刷新：重新 hydrate，数据、版本链、筛选一致，旧记录不重算 ----
const persisted = JSON.parse(mem.get("hxwlfront-13-quotes-v1")!) as typeof store.quotes;
const persistedV1 = persisted.find((x) => x.id === id)!.versions[0].fees;

setActivePinia(createPinia());
store = useQuoteStore();
store.hydrate();
q = store.getQuote(id)!;
check("刷新后版本数一致", q.versions.length === 3);
check("刷新后状态一致", q.status === "已报价");
check("刷新后v3仍为最新", store.latestVersion(q).fees.total === 600);
check("刷新后v1快照不变", q.versions[0].fees.total === v1Total);
check("种子版本链不变", JSON.stringify(store.quotes.filter((x) => x.id.startsWith("seed-")).map((x) => x.versions.length)) === seededTotal);
check("持久化明细与内存一致", persistedV1.total === q.versions[0].fees.total);

// ---- 旧记录不重算：篡改"当前规则目录"不可能，但可以验证快照独立于输入重算 ----
// 把已报价单最新版本的输入改回轻货参数，快照金额也不随筛选/渲染变化
const snapshotBefore = JSON.stringify(q.versions.map((v) => v.fees.total));
store.setFilters({ routeId: "sh-nj", keyword: "测试" });
check("筛选改变不重算任何版本", JSON.stringify(store.getQuote(id)!.versions.map((v) => v.fees.total)) === snapshotBefore);
check("筛选持久化且生效", store.filters.keyword === "测试" && store.filteredQuotes.every((x) => x.customer.includes("测试")));

// 删除
const beforeCount = store.quotes.length;
store.remove(id2);
check("删除生效", store.quotes.length === beforeCount - 1);
check("删除已持久化", !mem.get("hxwlfront-13-quotes-v1")!.includes(id2));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
