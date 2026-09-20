<script setup lang="ts">
/**
 * 报价列表 —— 每行展示的是该单据最新版本（或草稿试算）的口径
 */
import type { LatestView } from "../models/quote";
import { dateTime, discountLabel, money, volume, weight } from "../utils/format";

defineProps<{
  views: LatestView[];
}>();

const emit = defineEmits<{
  (e: "edit-draft", view: LatestView): void;
  (e: "approve", view: LatestView): void;
  (e: "reprice", view: LatestView): void;
  (e: "history", view: LatestView): void;
  (e: "close", view: LatestView): void;
  (e: "remove", view: LatestView): void;
}>();

const STATUS_CLASS: Record<string, string> = {
  待核价: "st-draft",
  已核价: "st-priced",
  已改价: "st-repriced",
  已关闭: "st-closed"
};
</script>

<template>
  <div class="record-grid">
    <div v-if="views.length === 0" class="empty">暂无匹配的报价记录</div>

    <article v-for="view in views" :key="view.record.id" class="record" :class="{ closed: view.record.status === '已关闭' }">
      <div class="record-head">
        <div class="title-wrap">
          <p class="record-title">
            {{ view.input.customer }}
            <span class="route">{{ view.fees.routeName }}</span>
          </p>
          <p class="record-meta">
            <span v-if="!view.isDraft" class="ver-tag">v{{ view.current!.version }}</span>
            <span v-else class="ver-tag draft-tag">草稿</span>
            <span>{{ dateTime(view.changedAt) }}</span>
            <span v-if="view.current?.kind === '改价'" class="reprice-flag">已改价 {{ view.record.versions.length - 1 }} 次</span>
          </p>
        </div>
        <span class="status" :class="STATUS_CLASS[view.record.status]">{{ view.record.status }}</span>
      </div>

      <div class="summary">
        <div class="sum-item">
          <span>计费重</span>
          <b>{{ weight(view.fees.chargeWeightKg) }}</b>
          <em class="basis">{{ view.fees.chargeWeightBasis }}</em>
        </div>
        <div class="sum-item">
          <span>体积</span>
          <b>{{ volume(view.input.volumeM3) }}</b>
        </div>
        <div class="sum-item">
          <span>折扣</span>
          <b>{{ discountLabel(view.input.discountRate) }}</b>
        </div>
        <div class="sum-item total">
          <span>{{ view.isDraft ? "试算合计" : "冻结合计" }}</span>
          <b>{{ money(view.fees.total) }}</b>
        </div>
      </div>

      <p class="reason-line">
        <span class="reason-key">{{ view.current?.kind === "改价" ? "改价原因" : "说明" }}</span>
        {{ view.reason }}
      </p>

      <div class="actions">
        <template v-if="view.record.status === '待核价'">
          <button type="button" @click="emit('edit-draft', view)">编辑草稿</button>
          <button type="button" class="approve" @click="emit('approve', view)">核价冻结</button>
        </template>
        <template v-else-if="view.record.status === '已核价' || view.record.status === '已改价'">
          <button type="button" @click="emit('reprice', view)">改价（新版本）</button>
          <button type="button" class="secondary" @click="emit('close', view)">关闭</button>
        </template>
        <button type="button" class="secondary" @click="emit('history', view)">
          版本链{{ view.record.versions.length > 1 ? `（${view.record.versions.length}）` : "" }}
        </button>
        <button type="button" class="danger ghost-danger" @click="emit('remove', view)">删除</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.record-grid {
  display: grid;
  gap: 12px;
}

.empty {
  text-align: center;
  color: #69758c;
  padding: 32px 12px;
}

.record {
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fbfcfe;
  display: grid;
  gap: 12px;
}

.record.closed {
  opacity: 0.72;
}

.record-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.record-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}

.route {
  font-size: 13px;
  font-weight: 600;
  color: #176b87;
}

.record-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: #93a0b5;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.ver-tag {
  background: #e8f4ef;
  color: #14724f;
  border-radius: 6px;
  padding: 1px 7px;
  font-weight: 700;
}

.draft-tag {
  background: #fdf6dd;
  color: #8a6310;
}

.reprice-flag {
  color: #b06a14;
}

.status {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.st-draft {
  background: #fdf6dd;
  color: #8a6310;
}

.st-priced {
  background: #e8f4ef;
  color: #14724f;
}

.st-repriced {
  background: #fdf0e2;
  color: #b06a14;
}

.st-closed {
  background: #eef2f7;
  color: #69758c;
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  padding: 10px 12px;
}

.sum-item {
  display: grid;
  gap: 2px;
  font-size: 12px;
  color: #93a0b5;
}

.sum-item b {
  font-size: 15px;
  color: #172033;
}

.sum-item.total b {
  color: #176b87;
  font-size: 19px;
}

.basis {
  font-style: normal;
  font-size: 11px;
  color: #176b87;
}

.reason-line {
  margin: 0;
  font-size: 13px;
  color: #445069;
  background: #eef5fb;
  border-radius: 8px;
  padding: 8px 10px;
}

.reason-key {
  color: #176b87;
  font-weight: 700;
  margin-right: 6px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  background: #176b87;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

button.secondary {
  background: #e8eef5;
  color: #172033;
}

button.approve {
  background: #14724f;
}

.ghost-danger {
  background: transparent;
  color: #c0392b;
  border: 1px solid #eccbc4;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
