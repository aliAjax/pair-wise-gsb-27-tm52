<script setup lang="ts">
/**
 * 版本链抽屉 —— 只读查看所有历史版本
 *
 * 版本按 vN 倒序展示（最新在前）；每个版本展示冻结时的输入、费用明细、
 * 改价原因与操作人。相邻版本展示合计差额。所有明细均来自存储快照，不重算。
 */
import { computed } from "vue";
import type { FeeBreakdown } from "../rules/pricing";
import type { QuoteInput, QuoteRecord } from "../models/quote";
import FeeBreakdownCard from "./FeeBreakdownCard.vue";
import { dateTime, discountLabel, volume, weight } from "../utils/format";

const props = defineProps<{
  record: QuoteRecord | null;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

interface Row {
  version: number;
  kind: string;
  reason: string;
  operator: string;
  createdAt: string;
  fees: FeeBreakdown | null;
  input: QuoteInput | null;
  delta: number | null;
  isDraft: boolean;
}

const rows = computed<Row[]>(() => {
  const record = props.record;
  if (!record) return [];
  const list: Row[] = [];

  // 草稿排在最前（它是尚未冻结的“下一版候选”）
  if (record.draft) {
    list.push({
      version: 0,
      kind: "草稿",
      reason: record.draft.input.remark ?? "核价前可编辑重算",
      operator: "草稿",
      createdAt: record.draft.updatedAt,
      fees: record.draft.fees,
      input: record.draft.input,
      delta:
        record.versions.length > 0
          ? record.draft.fees.total - record.versions[record.versions.length - 1]!.fees.total
          : null,
      isDraft: true
    });
  }

  // 已冻结版本倒序（最新版本在前）
  for (let i = record.versions.length - 1; i >= 0; i--) {
    const current = record.versions[i]!;
    const previous = record.versions[i - 1] ?? null;
    list.push({
      version: current.version,
      kind: current.kind,
      reason: current.reason,
      operator: current.operator,
      createdAt: current.createdAt,
      fees: current.fees,
      input: current.input,
      delta: previous ? current.fees.total - previous.fees.total : null,
      isDraft: false
    });
  }
  return list;
});
</script>

<template>
  <div v-if="record" class="drawer-mask" @click.self="emit('close')">
    <aside class="drawer" role="dialog" aria-modal="true">
      <header class="drawer-head">
        <div>
          <h3>版本链 · {{ record.versions[record.versions.length - 1]?.input.customer ?? record.draft?.input.customer }}</h3>
          <p>
            共 {{ record.versions.length }} 个已冻结版本
            <span v-if="record.draft">，另有 1 份待核价草稿</span>
          </p>
        </div>
        <button type="button" class="icon-btn" @click="emit('close')">×</button>
      </header>

      <div class="timeline">
        <article v-for="row in rows" :key="row.isDraft ? 'draft' : `v${row.version}`" class="version" :class="{ draft: row.isDraft }">
          <div class="version-head">
            <div class="badges">
              <span class="ver">{{ row.isDraft ? "草稿" : `v${row.version}` }}</span>
              <span class="kind" :class="row.kind">{{ row.kind }}</span>
              <span v-if="row.version === record.versions.length && !row.isDraft" class="latest">最新</span>
            </div>
            <time>{{ dateTime(row.createdAt) }}</time>
          </div>

          <p class="reason">
            <span class="reason-label">{{ row.isDraft ? "备注" : row.kind === "改价" ? "改价原因" : "核价说明" }}</span>
            {{ row.reason }}
          </p>
          <p class="operator">操作人：{{ row.operator }}</p>

          <div v-if="row.input" class="input-line">
            <span>{{ row.fees?.routeName }}</span>
            <span>实重 {{ weight(row.input.actualWeightKg) }}</span>
            <span>体积 {{ volume(row.input.volumeM3) }}</span>
            <span>{{ discountLabel(row.input.discountRate) }}</span>
          </div>

          <FeeBreakdownCard v-if="row.fees" :fees="row.fees" :delta="row.delta" />
        </article>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 51, 0.45);
  z-index: 50;
}

.drawer {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(520px, 100%);
  background: #f4f7fb;
  box-shadow: -16px 0 40px rgba(23, 32, 51, 0.2);
  display: flex;
  flex-direction: column;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  background: #fff;
  border-bottom: 1px solid #dfe7f1;
}

.drawer-head h3 {
  margin: 0 0 4px;
  font-size: 17px;
}

.drawer-head p {
  margin: 0;
  font-size: 12px;
  color: #69758c;
}

.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  background: #eef2f7;
  color: #445069;
  font-size: 18px;
  line-height: 1;
  flex: none;
}

.timeline {
  overflow: auto;
  padding: 16px 20px 28px;
  display: grid;
  gap: 14px;
}

.version {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-left: 3px solid #176b87;
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.version.draft {
  border-left-color: #d9941a;
  background: #fffdf6;
}

.version-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.badges {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.ver {
  font-weight: 800;
  font-size: 14px;
  color: #176b87;
}

.kind {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 9px;
  background: #e8f4ef;
  color: #14724f;
}

.kind.改价 {
  background: #fdf0e2;
  color: #b06a14;
}

.kind.草稿 {
  background: #fdf6dd;
  color: #8a6310;
}

.latest {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 9px;
  background: #176b87;
  color: #fff;
}

time {
  font-size: 12px;
  color: #93a0b5;
  white-space: nowrap;
}

.reason {
  margin: 0;
  font-size: 13px;
  color: #172033;
}

.reason-label {
  display: inline-block;
  margin-right: 6px;
  color: #69758c;
}

.operator {
  margin: 0;
  font-size: 12px;
  color: #93a0b5;
}

.input-line {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #536078;
}
</style>
