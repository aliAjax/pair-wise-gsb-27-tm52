<script setup lang="ts">
/**
 * 报价核价与改价留痕台 —— 界面装配层
 * 规则见 rules/，存储见 storage/，编排见 stores/，本文件只做组装与交互。
 */
import { computed, ref } from "vue";
import { ROUTES, RULES_VERSION, VOLUME_WEIGHT_FACTOR } from "./rules/pricing";
import { useQuoteStore } from "./stores/quoteStore";
import type { LatestView, QuoteInput, QuoteRecord } from "./models/quote";
import { money } from "./utils/format";
import QuoteForm from "./components/QuoteForm.vue";
import QuoteList from "./components/QuoteList.vue";
import RepriceDialog from "./components/RepriceDialog.vue";
import VersionDrawer from "./components/VersionDrawer.vue";

const store = useQuoteStore();

// 左栏模式：新建 / 编辑待核价草稿
const editingId = ref<string | null>(null);
const editingInitial = ref<QuoteInput | null>(null);
const formKey = ref(0);

// 弹窗状态
const repriceTarget = ref<LatestView | null>(null);
const historyRecord = ref<QuoteRecord | null>(null);

const metrics = computed(() => [
  { label: "报价单数", value: store.stats.total },
  { label: "待核价", value: store.stats.drafts },
  { label: "已核价/改价", value: store.stats.priced },
  { label: "改价留痕次数", value: store.stats.revisions },
  { label: "最新口径总金额", value: money(store.stats.amount) }
]);

const maxChart = computed(() => Math.max(1, ...store.statusCounts.map((row) => row.value)));

const formTitle = computed(() => (editingId.value ? "编辑待核价草稿" : "新增报价试算"));

function resetForm() {
  editingId.value = null;
  editingInitial.value = null;
  formKey.value += 1;
}

function onSubmitDraft(input: QuoteInput) {
  if (editingId.value) {
    store.saveDraft(input, editingId.value);
  } else {
    store.saveDraft(input);
  }
  resetForm();
}

function onSubmitApprove(input: QuoteInput, note: string) {
  if (editingId.value) {
    // 先更新草稿，再核价冻结为 v1
    const record = store.saveDraft(input, editingId.value);
    store.approve(record.id, note);
  } else {
    // 直接核价：先建草稿再立即冻结，保证所有 v1 都走同一条核价路径
    const record = store.saveDraft(input);
    store.approve(record.id, note);
  }
  resetForm();
}

function onEditDraft(view: LatestView) {
  editingId.value = view.record.id;
  editingInitial.value = { ...view.input };
  formKey.value += 1;
}

function onApprove(view: LatestView) {
  if (view.record.status === "待核价") {
    const note = window.prompt("核价说明（可留空）", view.input.remark ?? "") ?? "";
    store.approve(view.record.id, note);
  }
}

function onRepriceConfirm(id: string, input: QuoteInput, reason: string) {
  store.reprice(id, input, reason);
  repriceTarget.value = null;
}

function onClose(view: LatestView) {
  if (window.confirm(`确认关闭「${view.input.customer}」的报价单？关闭后不可继续改价。`)) {
    store.close(view.record.id);
  }
}

function onRemove(view: LatestView) {
  if (window.confirm(`确认删除「${view.input.customer}」整笔报价及其版本链？此操作不可恢复。`)) {
    store.remove(view.record.id);
    if (editingId.value === view.record.id) resetForm();
  }
}

function openHistory(view: LatestView) {
  historyRecord.value = view.record;
}

function resetDemo() {
  if (window.confirm("确认清空当前数据并恢复演示报价？")) {
    store.resetAll();
    resetForm();
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流报价 · 核价冻结 · 改价留痕</p>
          <h1>报价核价与改价留痕台</h1>
          <p class="subtitle">
            按线路、实重、体积与重量档位计价：体积重 {{ VOLUME_WEIGHT_FACTOR }}kg/m³，计费重取实重与体积重较大者、
            不足起计重量按起计重量；折扣只作用重量费，燃油附加费最后加。核价后冻结费用明细，改价须填原因并生成新版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3 + Pinia</span>
          <span class="tag">规则/存储/界面分离</span>
          <span class="tag">规则版本 {{ RULES_VERSION }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="item in metrics" :key="item.label" class="metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <div class="panel">
          <div class="panel-head">
            <h2>{{ formTitle }}</h2>
            <button v-if="editingId" type="button" class="link-btn" @click="resetForm">＋ 新建报价</button>
          </div>

          <div class="operator-row">
            <label>
              操作人
              <input
                :value="store.prefs.operator"
                placeholder="记录到版本上"
                @input="store.setFilter({ operator: ($event.target as HTMLInputElement).value })"
              />
            </label>
          </div>

          <QuoteForm
            :key="formKey"
            :initial="editingInitial"
            @submit-draft="onSubmitDraft"
            @submit-approve="onSubmitApprove"
            @cancel="resetForm"
          />
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>报价列表 <em>（读取最新版本）</em></h2>
            <button type="button" class="secondary small" @click="resetDemo">恢复演示数据</button>
          </div>

          <div class="filters">
            <select
              :value="store.prefs.routeFilter"
              @change="store.setFilter({ routeFilter: ($event.target as HTMLSelectElement).value })"
            >
              <option value="ALL">全部线路</option>
              <option v-for="route in ROUTES" :key="route.code" :value="route.code">{{ route.name }}</option>
            </select>

            <select
              :value="store.prefs.statusFilter"
              @change="store.setFilter({ statusFilter: ($event.target as HTMLSelectElement).value })"
            >
              <option value="ALL">全部状态</option>
              <option value="待核价">待核价</option>
              <option value="已核价">已核价</option>
              <option value="已改价">已改价</option>
              <option value="已关闭">已关闭</option>
            </select>

            <input
              class="keyword"
              placeholder="搜索客户 / 备注 / 改价原因"
              :value="store.prefs.keyword"
              @input="store.setFilter({ keyword: ($event.target as HTMLInputElement).value })"
            />
          </div>

          <QuoteList
            :views="store.filteredViews"
            @edit-draft="onEditDraft"
            @approve="onApprove"
            @reprice="repriceTarget = $event"
            @history="openHistory"
            @close="onClose"
            @remove="onRemove"
          />

          <div class="mini-chart">
            <div v-for="row in store.statusCounts" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>

    <RepriceDialog
      :view="repriceTarget"
      @confirm="onRepriceConfirm"
      @close="repriceTarget = null"
    />

    <VersionDrawer
      :record="historyRecord"
      @close="historyRecord = null"
    />
  </main>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-head h2,
.toolbar h2 {
  margin: 0;
  font-size: 19px;
}

.toolbar h2 em {
  font-style: normal;
  font-size: 12px;
  color: #93a0b5;
  font-weight: 500;
}

.link-btn {
  background: none;
  color: #176b87;
  padding: 4px 8px;
  font-size: 13px;
}

.operator-row {
  margin-bottom: 12px;
}

.operator-row label {
  display: grid;
  gap: 6px;
  color: #445069;
  font-size: 13px;
}

.toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.small {
  padding: 7px 10px;
  font-size: 12px;
}

.filters {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 8px;
  margin-bottom: 14px;
}

.mini-chart {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #eef2f7;
}

.bar {
  display: grid;
  grid-template-columns: 72px 1fr 36px;
  gap: 10px;
  align-items: center;
  color: #536078;
  font-size: 13px;
}

.bar-track {
  height: 10px;
  border-radius: 999px;
  background: #e7edf4;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #176b87, #64b6ac);
}

@media (max-width: 860px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
