<script setup lang="ts">
/**
 * 报价试算表单（新建 / 编辑待核价草稿共用）
 *
 * 输入变化时调用规则层实时试算，但不落任何费用；
 * 「存草稿」只保存可重算的草稿，「核价并冻结」由 store.approve 生成 v1。
 */
import { computed, reactive, ref, watch } from "vue";
import { ROUTES, priceQuote, PricingError, type FeeBreakdown } from "../rules/pricing";
import type { QuoteInput } from "../models/quote";
import FeeBreakdownCard from "./FeeBreakdownCard.vue";
import { money } from "../utils/format";

const props = defineProps<{
  /** 编辑待核价草稿时传入；新建为空 */
  initial?: QuoteInput | null;
  approveLabel?: string;
}>();

const emit = defineEmits<{
  (e: "submit-draft", input: QuoteInput): void;
  (e: "submit-approve", input: QuoteInput, note: string): void;
  (e: "cancel"): void;
}>();

function blank(): QuoteInput {
  return {
    customer: "",
    routeCode: ROUTES[0]!.code,
    actualWeightKg: 0,
    volumeM3: 0,
    discountRate: 1,
    remark: ""
  };
}

const form = reactive<QuoteInput>({ ...(props.initial ?? blank()) });
const approveNote = ref("");
const touched = ref(false);

watch(
  () => props.initial,
  (value) => Object.assign(form, value ?? blank())
);

const preview = computed<{ fees: FeeBreakdown | null; error: string | null }>(() => {
  try {
    return { fees: priceQuote(form), error: null };
  } catch (error) {
    return { fees: null, error: error instanceof PricingError ? error.message : "试算失败" };
  }
});

const valid = computed(
  () => form.customer.trim().length > 0 && preview.value.fees !== null
);

function payload(): QuoteInput {
  return {
    customer: form.customer.trim(),
    routeCode: form.routeCode,
    actualWeightKg: Number(form.actualWeightKg),
    volumeM3: Number(form.volumeM3),
    discountRate: Number(form.discountRate),
    remark: form.remark?.trim() || undefined
  };
}

function saveDraft() {
  touched.value = true;
  if (!valid.value) return;
  emit("submit-draft", payload());
}

function approve() {
  touched.value = true;
  if (!valid.value) return;
  emit("submit-approve", payload(), approveNote.value);
}
</script>

<template>
  <form class="quote-form" @submit.prevent>
    <div class="form-grid">
      <label>
        客户名称
        <input v-model="form.customer" placeholder="如：海沃商贸" />
      </label>

      <label>
        运输线路
        <select v-model="form.routeCode">
          <option v-for="route in ROUTES" :key="route.code" :value="route.code">
            {{ route.name }}（起计 {{ route.minChargeWeightKg }}kg · 燃油
            {{ (route.fuelRate * 100).toFixed(0) }}%）
          </option>
        </select>
      </label>

      <label>
        实重 kg
        <input v-model.number="form.actualWeightKg" type="number" min="0" step="0.1" />
      </label>

      <label>
        体积 m³
        <input v-model.number="form.volumeM3" type="number" min="0" step="0.01" />
      </label>

      <label>
        重量费折扣（不作用于燃油）
        <select v-model.number="form.discountRate">
          <option :value="1">无折扣</option>
          <option :value="0.95">95 折</option>
          <option :value="0.9">9 折</option>
          <option :value="0.85">85 折</option>
          <option :value="0.8">8 折</option>
        </select>
      </label>

      <label class="span-2">
        备注
        <textarea v-model="form.remark" placeholder="温区、包装、提货要求等" />
      </label>
    </div>

    <p v-if="touched && !form.customer.trim()" class="form-error">请填写客户名称</p>
    <p v-else-if="preview.error" class="form-error">{{ preview.error }}</p>

    <div v-if="preview.fees" class="preview">
      <p class="preview-title">实时试算（核价前可改，尚未冻结）</p>
      <FeeBreakdownCard :fees="preview.fees" />
    </div>

    <label class="approve-note">
      核价说明（可选）
      <input v-model="approveNote" placeholder="核价并冻结时记入 v1 版本" />
    </label>

    <div class="form-actions">
      <button type="button" :disabled="!valid" @click="approve">
        {{ approveLabel ?? "核价并冻结" }}
      </button>
      <button type="button" class="secondary" :disabled="!valid" @click="saveDraft">存为待核价草稿</button>
      <button type="button" class="ghost" @click="emit('cancel')">取消</button>
    </div>
    <p class="quick-total" v-if="preview.fees">试算合计 <b>{{ money(preview.fees.total) }}</b></p>
  </form>
</template>

<style scoped>
.quote-form {
  display: grid;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-grid label {
  display: grid;
  gap: 6px;
  color: #445069;
  font-size: 13px;
}

.span-2 {
  grid-column: span 2;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cfd8e5;
  border-radius: 8px;
  padding: 9px 11px;
  color: #172033;
  background: #fbfcfe;
  font: inherit;
}

textarea {
  min-height: 64px;
  resize: vertical;
}

.preview {
  display: grid;
  gap: 6px;
}

.preview-title {
  margin: 0;
  font-size: 12px;
  color: #176b87;
  font-weight: 700;
}

.approve-note {
  display: grid;
  gap: 6px;
  color: #445069;
  font-size: 13px;
}

.form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ghost {
  background: transparent;
  color: #5b667a;
  border: 1px solid #cfd8e5;
}

.form-error {
  margin: 0;
  color: #c0392b;
  font-size: 13px;
}

.quick-total {
  margin: 0;
  font-size: 13px;
  color: #5b667a;
}

.quick-total b {
  color: #176b87;
  font-size: 16px;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .span-2 {
    grid-column: span 1;
  }
}
</style>
