<script setup lang="ts">
/** 新增试算表单：预览只调规则层纯函数；保存/提交才走 store 落库 */
import { computed, reactive } from "vue";
import { ROUTE_RULES, RULE_VERSION } from "../rules/catalog";
import { calculate } from "../rules/pricing";
import type { FeeBreakdown, QuoteInput } from "../rules/types";
import { useQuoteStore } from "../storage/store";
import FeeTable from "./FeeTable.vue";

const emit = defineEmits<{ (e: "created", id: string): void }>();

const form = reactive({
  customer: "",
  remark: "",
  routeId: ROUTE_RULES[0].id,
  actualWeight: 120,
  volume: 0.5,
  extraFee: 0,
  useCustomRates: false,
  discountRate: ROUTE_RULES[0].defaultDiscountRate * 100,
  fuelRate: ROUTE_RULES[0].defaultFuelRate * 100,
});

const store = useQuoteStore();

const selectedRule = computed(
  () => ROUTE_RULES.find((r) => r.id === form.routeId) ?? ROUTE_RULES[0]
);

function syncDefaults() {
  form.discountRate = selectedRule.value.defaultDiscountRate * 100;
  form.fuelRate = selectedRule.value.defaultFuelRate * 100;
}

const quoteInput = computed<QuoteInput>(() => ({
  routeId: form.routeId,
  actualWeight: Number(form.actualWeight) || 0,
  volume: Number(form.volume) || 0,
  extraFee: Number(form.extraFee) || 0,
  discountRate: form.useCustomRates ? Number(form.discountRate) / 100 : undefined,
  fuelRate: form.useCustomRates ? Number(form.fuelRate) / 100 : undefined,
}));

const preview = computed<{ fees: FeeBreakdown | null; error: string }>(() => {
  try {
    if (
      Number.isNaN(Number(form.actualWeight)) ||
      Number.isNaN(Number(form.volume))
    ) {
      return { fees: null, error: "请输入有效数字" };
    }
    const { fees } = calculate(selectedRule.value, quoteInput.value, RULE_VERSION);
    return { fees, error: "" };
  } catch (e) {
    return { fees: null, error: (e as Error).message };
  }
});

function validate(): string {
  if (!form.customer.trim()) return "请填写客户名称";
  if (form.actualWeight < 0 || form.volume < 0 || form.extraFee < 0) return "重量、体积、附加费不能为负";
  if (form.useCustomRates) {
    if (form.discountRate < 0 || form.discountRate > 100) return "折扣率需在 0–100% 之间";
    if (form.fuelRate < 0 || form.fuelRate > 100) return "燃油费率需在 0–100% 之间";
  }
  return "";
}

function save(submit: boolean) {
  const err = validate() || preview.value.error;
  if (err) {
    window.alert(err);
    return;
  }
  const payload = {
    customer: form.customer.trim(),
    remark: form.remark.trim(),
    input: quoteInput.value,
  };
  const id = store.createDraft(payload);
  if (submit) store.submitForApproval(id, "业务员");
  emit("created", id);
  form.customer = "";
  form.remark = "";
}
</script>

<template>
  <section class="panel">
    <h2>新增试算</h2>
    <div class="form-grid">
      <label>
        客户名称
        <input v-model="form.customer" placeholder="如：海沃商贸" required />
      </label>
      <label>
        运输线路
        <select v-model="form.routeId" @change="syncDefaults">
          <option v-for="r in ROUTE_RULES" :key="r.id" :value="r.id">
            {{ r.name }}（起计 {{ r.minChargeWeight }}kg）
          </option>
        </select>
      </label>
      <div class="two-col">
        <label>
          实重 kg
          <input v-model.number="form.actualWeight" type="number" min="0" step="1" />
        </label>
        <label>
          体积 m³
          <input v-model.number="form.volume" type="number" min="0" step="0.01" />
        </label>
      </div>
      <p class="rule-hint">
        体积重 = 体积 × 200 kg/m³；计费重取实重与体积重较大者，低于线路起计重量按起计重量。
      </p>
      <label>
        其他附加费（装卸/保险等，元）
        <input v-model.number="form.extraFee" type="number" min="0" step="1" />
      </label>
      <label class="checkbox">
        <input v-model="form.useCustomRates" type="checkbox" />
        自定义折扣率 / 燃油费率（默认取线路档位）
      </label>
      <div v-if="form.useCustomRates" class="two-col">
        <label>
          折扣率 %（仅重量费）
          <input v-model.number="form.discountRate" type="number" min="0" max="100" step="0.5" />
        </label>
        <label>
          燃油费率 %（最后加）
          <input v-model.number="form.fuelRate" type="number" min="0" max="100" step="0.5" />
        </label>
      </div>
      <label>
        备注
        <textarea v-model="form.remark" placeholder="货物说明、时效要求等" />
      </label>

      <div class="preview">
        <h3>实时试算（未保存）</h3>
        <p v-if="preview.error" class="error">{{ preview.error }}</p>
        <FeeTable v-else-if="preview.fees" :fees="preview.fees" highlight-total />
      </div>

      <div class="form-actions">
        <button type="button" class="secondary" @click="save(false)">保存草稿</button>
        <button type="button" @click="save(true)">计算并提交核价</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.rule-hint {
  margin: 0;
  font-size: 12.5px;
  color: #8a94a8;
  line-height: 1.6;
  background: #f4f7fb;
  border-radius: 8px;
  padding: 8px 10px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.checkbox input {
  width: auto;
}
.preview {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fbfcfe;
}
.preview h3 {
  margin: 0 0 6px;
  font-size: 14px;
  color: #176b87;
}
.error {
  color: #c84b31;
  font-size: 13px;
  margin: 4px 0;
}
.form-actions {
  display: flex;
  gap: 10px;
}
</style>
