<script setup lang="ts">
/**
 * 费用明细展示（只读）—— 核价/改价后展示的就是冻结快照
 */
import { computed } from "vue";
import type { FeeBreakdown } from "../rules/pricing";
import { VOLUME_WEIGHT_FACTOR } from "../rules/pricing";
import { discountLabel, money, percent, volume, weight } from "../utils/format";

const props = defineProps<{
  fees: FeeBreakdown;
  /** 与上一版本（或对比基准）的总价差额 */
  delta?: number | null;
}>();

const rows = computed(() => [
  { k: "实重", v: weight(props.fees.actualWeightKg) },
  { k: `体积重（${VOLUME_WEIGHT_FACTOR}kg/m³）`, v: `${volume(props.fees.volumeM3)} → ${weight(props.fees.volumeWeightKg)}` },
  {
    k: "计费重",
    v: `${weight(props.fees.chargeWeightKg)}（取${props.fees.chargeWeightBasis}，起计${weight(props.fees.minChargeWeightKg)}）`
  },
  { k: "重量档位", v: `${props.fees.tierLabel}，单价 ${money(props.fees.unitPrice)}/kg` }
]);

const deltaClass = computed(() => {
  if (props.delta == null || props.delta === 0) return "delta delta-flat";
  return props.delta > 0 ? "delta delta-up" : "delta delta-down";
});
</script>

<template>
  <div class="fee-card">
    <dl class="fee-rows">
      <div v-for="row in rows" :key="row.k" class="fee-row">
        <dt>{{ row.k }}</dt>
        <dd>{{ row.v }}</dd>
      </div>
    </dl>

    <div class="fee-lines">
      <div class="fee-line">
        <span>重量费（原价）</span>
        <b>{{ money(fees.weightFeeRaw) }}</b>
      </div>
      <div class="fee-line">
        <span>重量折扣（仅作用重量费）</span>
        <b>{{ discountLabel(fees.discountRate) }}</b>
      </div>
      <div class="fee-line">
        <span>折后重量费</span>
        <b>{{ money(fees.weightFee) }}</b>
      </div>
      <div class="fee-line">
        <span>燃油附加费（{{ percent(fees.fuelRate) }}，最后加）</span>
        <b>{{ money(fees.fuelSurcharge) }}</b>
      </div>
    </div>

    <div class="fee-total">
      <span>
        合计
        <em v-if="delta != null" :class="deltaClass">较上版 {{ delta > 0 ? "+" : "" }}{{ money(delta) }}</em>
      </span>
      <strong>{{ money(fees.total) }}</strong>
    </div>
    <p class="fee-meta">规则版本 {{ fees.rulesVersion }}</p>
  </div>
</template>

<style scoped>
.fee-card {
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  background: #fbfcfe;
  padding: 12px 14px;
}

.fee-rows {
  margin: 0 0 10px;
  display: grid;
  gap: 6px;
}

.fee-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.fee-row dt {
  color: #69758c;
}

.fee-row dd {
  margin: 0;
  color: #172033;
  text-align: right;
}

.fee-lines {
  border-top: 1px dashed #cfd8e5;
  padding-top: 8px;
  display: grid;
  gap: 6px;
}

.fee-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #536078;
}

.fee-line b {
  font-weight: 600;
  color: #172033;
}

.fee-total {
  margin-top: 10px;
  border-top: 1px solid #cfd8e5;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fee-total span {
  color: #445069;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fee-total strong {
  font-size: 22px;
  color: #176b87;
}

.delta {
  font-style: normal;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}

.delta-up {
  color: #b23b24;
  background: #fdeae5;
}

.delta-down {
  color: #14724f;
  background: #e8f4ef;
}

.delta-flat {
  color: #69758c;
  background: #eef2f7;
}

.fee-meta {
  margin: 8px 0 0;
  font-size: 11px;
  color: #93a0b5;
}
</style>
