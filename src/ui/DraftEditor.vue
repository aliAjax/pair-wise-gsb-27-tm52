<script setup lang="ts">
/** 草稿重算面板：仅在最新版本为未冻结草稿时出现，覆盖唯一草稿版本（不新增版本） */
import { reactive, watch } from "vue";
import { ROUTE_RULES } from "../rules/catalog";
import { useQuoteStore } from "../storage/store";
import type { Quote } from "../rules/types";

const props = defineProps<{ quote: Quote }>();
const store = useQuoteStore();

const draft = reactive({
  customer: "",
  remark: "",
  routeId: "",
  actualWeight: 0,
  volume: 0,
  extraFee: 0,
  discountRatePct: 90,
  fuelRatePct: 8,
  useCustom: false,
});

function syncFromLatest() {
  const v = store.latestVersion(props.quote);
  draft.customer = props.quote.customer;
  draft.remark = props.quote.remark;
  draft.routeId = v.input.routeId;
  draft.actualWeight = v.input.actualWeight;
  draft.volume = v.input.volume;
  draft.extraFee = v.input.extraFee;
  draft.discountRatePct = +(v.fees.discountRate * 100).toFixed(2);
  draft.fuelRatePct = +(v.fees.fuelRate * 100).toFixed(2);
  draft.useCustom = v.input.discountRate !== undefined || v.input.fuelRate !== undefined;
}
watch(() => props.quote.id, syncFromLatest, { immediate: true });

function save() {
  try {
    store.updateDraft(props.quote.id, {
      customer: draft.customer.trim() || props.quote.customer,
      remark: draft.remark.trim(),
      input: {
        routeId: draft.routeId,
        actualWeight: Number(draft.actualWeight) || 0,
        volume: Number(draft.volume) || 0,
        extraFee: Number(draft.extraFee) || 0,
        discountRate: draft.useCustom ? Number(draft.discountRatePct) / 100 : undefined,
        fuelRate: draft.useCustom ? Number(draft.fuelRatePct) / 100 : undefined,
      },
    });
  } catch (e) {
    window.alert((e as Error).message);
  }
}
</script>

<template>
  <div>
    <div class="revise-grid">
      <label>客户名称<input v-model="draft.customer" :placeholder="quote.customer" /></label>
      <label>线路
        <select v-model="draft.routeId">
          <option v-for="r in ROUTE_RULES" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </label>
      <label>实重 kg<input v-model.number="draft.actualWeight" type="number" min="0" /></label>
      <label>体积 m³<input v-model.number="draft.volume" type="number" step="0.01" min="0" /></label>
      <label>附加费 元<input v-model.number="draft.extraFee" type="number" min="0" /></label>
    </div>
    <label class="checkbox">
      <input v-model="draft.useCustom" type="checkbox" />
      自定义折扣率 / 燃油费率
    </label>
    <div v-if="draft.useCustom" class="revise-grid">
      <label>折扣率 %<input v-model.number="draft.discountRatePct" type="number" min="0" max="100" step="0.5" /></label>
      <label>燃油费率 %<input v-model.number="draft.fuelRatePct" type="number" min="0" max="100" step="0.5" /></label>
    </div>
    <label class="reason-box">
      备注
      <textarea v-model="draft.remark" />
    </label>
    <button type="button" @click="save">保存重算结果（覆盖草稿版本）</button>
  </div>
</template>

<style scoped>
.revise-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.revise-grid label { font-size: 12.5px; display: grid; gap: 5px; }
.checkbox { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 8px 0; }
.checkbox input { width: auto; }
.reason-box { display: grid; gap: 6px; margin: 8px 0 10px; font-size: 13.5px; }
</style>
