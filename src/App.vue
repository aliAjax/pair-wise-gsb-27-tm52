<script setup lang="ts">
/**
 * 界面层壳：指标 / 筛选 / 列表均从 store 的最新版本读取；
 * 计价规则见 src/rules，持久化见 src/storage。
 */
import { computed, onMounted, ref } from "vue";
import { ROUTE_RULES } from "./rules/catalog";
import { QUOTE_STATUSES } from "./rules/types";
import type { Quote } from "./rules/types";
import { useQuoteStore } from "./storage/store";
import QuoteForm from "./ui/QuoteForm.vue";
import QuoteDrawer from "./ui/QuoteDrawer.vue";

const store = useQuoteStore();
onMounted(() => store.hydrate());

const openId = ref<string | null>(null);
const activeQuote = computed<Quote | null>(() =>
  openId.value ? store.getQuote(openId.value) ?? null : null
);

function open(quote: Quote) {
  openId.value = quote.id;
}
function close() {
  openId.value = null;
}

function money(v: number) {
  return `¥${v.toFixed(2)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}
function cardSummary(quote: Quote) {
  const v = store.latestVersion(quote);
  const f = v.fees;
  return {
    v,
    billing: f.billingWeight,
    tier: f.tierLabel,
    total: f.total,
    manual: f.manualAdjustment,
    count: quote.versions.length,
  };
}

const maxStatusCount = computed(() =>
  Math.max(1, ...store.statusCounts.map((r) => r.value))
);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流核价 · 改价留痕</p>
          <h1>报价核价与改价留痕台</h1>
          <p class="subtitle">
            按线路、实重、体积与重量档位计价：体积重 = 体积 × 200 kg/m³，计费重取实重/体积重较大者、
            低于起计重量按起计重量；折扣只作用于重量费，燃油附加费最后加。核价后明细冻结，改价必须写原因并生成新版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">规则层 pricing</span>
          <span class="tag">存储层 repository</span>
          <span class="tag">界面层 Vue</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>报价单数</span>
          <strong>{{ store.metrics.total }}</strong>
        </article>
        <article class="metric">
          <span>已核价 / 已报价</span>
          <strong>{{ store.metrics.pricing }}</strong>
        </article>
        <article class="metric">
          <span>累计版本数（含留痕）</span>
          <strong>{{ store.metrics.versions }}</strong>
        </article>
        <article class="metric">
          <span>在台报价金额</span>
          <strong>{{ money(store.metrics.amount) }}</strong>
        </article>
      </section>

      <section class="workspace">
        <QuoteForm />

        <section class="list-panel">
          <div class="toolbar">
            <h2>报价列表</h2>
            <div class="filters">
              <input
                class="kw"
                :value="store.filters.keyword"
                placeholder="搜客户名 / 单号"
                @input="store.setFilters({ keyword: ($event.target as HTMLInputElement).value })"
              />
              <select
                :value="store.filters.routeId"
                @change="store.setFilters({ routeId: ($event.target as HTMLSelectElement).value })"
              >
                <option value="全部">全部线路</option>
                <option v-for="r in ROUTE_RULES" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <select
                :value="store.filters.status"
                @change="store.setFilters({ status: ($event.target as HTMLSelectElement).value })"
              >
                <option value="全部">全部状态</option>
                <option v-for="s in QUOTE_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
              <button type="button" class="secondary small" @click="store.resetFilters()">重置</button>
            </div>
          </div>

          <div class="record-grid">
            <div v-if="store.filteredQuotes.length === 0" class="empty">暂无匹配报价</div>
            <article
              v-for="quote in store.filteredQuotes"
              :key="quote.id"
              class="record"
              @click="open(quote)"
            >
              <div class="record-head">
                <div>
                  <p class="record-title">{{ quote.customer }}</p>
                  <p class="record-sub">
                    {{ cardSummary(quote).v.fees.routeName }} ·
                    计费重 {{ cardSummary(quote).billing }}kg ·
                    {{ cardSummary(quote).tier }}
                  </p>
                </div>
                <span class="status" :class="`st-${quote.status}`">{{ quote.status }}</span>
              </div>
              <div class="record-body">
                <div class="price">
                  <span class="price-label">v{{ cardSummary(quote).v.version }} 合计</span>
                  <strong>{{ money(cardSummary(quote).total) }}</strong>
                  <em v-if="cardSummary(quote).manual" class="manual-flag">人工改价</em>
                </div>
                <ul class="meta">
                  <li>版本 {{ cardSummary(quote).count }} 个 · 旧版可查</li>
                  <li>更新于 {{ fmtDate(quote.updatedAt) }}</li>
                </ul>
              </div>
              <div class="actions" @click.stop>
                <button
                  v-if="quote.status === '草稿'"
                  type="button"
                  @click="store.submitForApproval(quote.id)"
                >提交核价</button>
                <button
                  v-else-if="store.nextActions(quote.status).length"
                  type="button"
                  @click="store.transition(quote.id, store.nextActions(quote.status)[0])"
                >{{ store.actionLabel(quote.status) }}</button>
                <button class="secondary" type="button" @click="open(quote)">
                  详情 / 改价留痕
                </button>
                <button class="danger ghost" type="button" @click="store.remove(quote.id)">删除</button>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in store.statusCounts" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxStatusCount) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>

    <QuoteDrawer :quote="activeQuote" @close="close" />
  </main>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.filters .kw {
  width: 170px;
  padding: 8px 10px;
}
.filters select {
  padding: 8px 10px;
  width: auto;
}
.small {
  padding: 8px 12px;
}
.record {
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.record:hover {
  box-shadow: 0 4px 14px rgba(23, 32, 51, 0.08);
}
.record-sub {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: #8a94a8;
}
.record-body {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin: 10px 0;
}
.price {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.price-label {
  font-size: 12px;
  color: #8a94a8;
}
.price strong {
  font-size: 24px;
  color: #176b87;
  font-variant-numeric: tabular-nums;
}
.manual-flag {
  font-style: normal;
  font-size: 11px;
  background: #fdf6e3;
  color: #8a6d1d;
  border-radius: 999px;
  padding: 2px 8px;
}
.meta {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: right;
  color: #8a94a8;
  font-size: 12px;
  line-height: 1.7;
}
.ghost {
  background: transparent;
  color: #c84b31;
  border: 1px solid #ecc7be;
}
.st-草稿 { background: #eef2f7; color: #536078; }
.st-待核价 { background: #fdf6e3; color: #8a6d1d; }
.st-已核价 { background: #e8f4ef; color: #14724f; }
.st-已报价 { background: #e6f0fb; color: #1a5fb4; }
.st-已失效 { background: #fbeae6; color: #c84b31; }
</style>
