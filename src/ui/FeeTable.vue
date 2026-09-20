<script setup lang="ts">
/** 费用明细展示组件：冻结快照只读呈现，不做任何计算以外的事 */
import type { FeeBreakdown } from "../rules/types";
import { VOLUMETRIC_FACTOR } from "../rules/catalog";

const props = defineProps<{
  fees: FeeBreakdown;
  highlightTotal?: boolean;
}>();
void props;
function money(v: number) {
  return `¥${v.toFixed(2)}`;
}
function percent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

// 明细口径固定，直接读快照字段（旧版本也按自己的快照展示）
const rows = (f: FeeBreakdown) => [
  { label: "实重", value: `${f.actualWeight} kg` },
  { label: "体积", value: `${f.volume} m³` },
  {
    label: "体积重",
    value: `${f.volumetricWeight} kg`,
    hint: `体积 × ${VOLUMETRIC_FACTOR} kg/m³`,
  },
  { label: "线路起计重量", value: `${f.minChargeWeight} kg` },
  {
    label: "计费重（取较大者）",
    value: `${f.billingWeight} kg`,
    hint: f.floorApplied ? "低于起计重量，按起计重量计" : "未触发起计重量",
  },
  { label: "命中档位", value: f.tierLabel },
  { label: "档位单价", value: `${money(f.unitPrice)} / kg` },
  { label: "重量费", value: money(f.weightFee) },
  { label: "折扣率（仅重量费）", value: percent(f.discountRate) },
  { label: "折扣让出", value: `-${money(f.discountAmount)}` },
  { label: "折后重量费", value: money(f.discountedWeightFee) },
  { label: "其他附加费", value: money(f.extraFee) },
  { label: "燃油费率", value: percent(f.fuelRate) },
  {
    label: "燃油附加费（最后加）",
    value: money(f.fuelSurcharge),
    hint: `基数 = 折后重量费 + 附加费 = ${money(f.discountedWeightFee + f.extraFee)}`,
  },
];
</script>

<template>
  <dl class="fee-table">
    <template v-for="row in rows(fees)" :key="row.label">
      <dt>
        {{ row.label }}
        <em v-if="row.hint" class="hint">{{ row.hint }}</em>
      </dt>
      <dd :class="{ strong: row.label === '折后重量费' || row.label.startsWith('燃油') }">{{ row.value }}</dd>
    </template>
    <template v-if="fees.manualAdjustment !== 0">
      <dt>人工改价调整</dt>
      <dd :class="fees.manualAdjustment > 0 ? 'up' : 'down'">
        {{ fees.manualAdjustment > 0 ? "+" : "" }}{{ money(fees.manualAdjustment) }}
      </dd>
    </template>
    <dt class="total-row">合计（冻结快照）</dt>
    <dd class="total-row" :class="{ totalhl: highlightTotal }">{{ money(fees.total) }}</dd>
    <dt class="meta-row">规则版本</dt>
    <dd class="meta-row">{{ fees.ruleVersion }} · {{ fees.routeName }}</dd>
  </dl>
</template>

<style scoped>
.fee-table {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0;
  margin: 0;
  font-size: 13.5px;
}
.fee-table dt {
  color: #5b667a;
  padding: 7px 8px;
  border-bottom: 1px dashed #e3e9f2;
}
.fee-table dd {
  margin: 0;
  padding: 7px 8px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px dashed #e3e9f2;
}
.fee-table .strong { font-weight: 700; }
.fee-table .up { color: #c84b31; font-weight: 700; }
.fee-table .down { color: #14724f; font-weight: 700; }
.fee-table .total-row {
  font-size: 16px;
  font-weight: 800;
  border-bottom: 0;
  padding-top: 10px;
  color: #172033;
}
.fee-table .totalhl { color: #176b87; font-size: 18px; }
.fee-table .meta-row {
  font-size: 12px;
  color: #8a94a8;
  border-bottom: 0;
  padding-top: 2px;
}
.hint {
  display: block;
  font-style: normal;
  font-size: 11.5px;
  color: #97a1b4;
}
</style>
