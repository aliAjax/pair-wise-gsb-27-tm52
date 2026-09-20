<script setup lang="ts">
/**
 * 改价弹窗
 *
 * 规则：改价原因必填；表单按当前规则实时试算；
 * 确认后由 store.reprice 在版本链尾部追加新版本，旧版本不动。
 * 默认带出最新版本的输入，可在此基础上改线路/实重/体积/折扣。
 */
import { computed, reactive, ref, watch } from "vue";
import { ROUTES, priceQuote, PricingError, type FeeBreakdown } from "../rules/pricing";
import type { LatestView, QuoteInput } from "../models/quote";
import FeeBreakdownCard from "./FeeBreakdownCard.vue";

const props = defineProps<{
  view: LatestView | null;
}>();

const emit = defineEmits<{
  (e: "confirm", id: string, input: QuoteInput, reason: string): void;
  (e: "close"): void;
}>();

const form = reactive<QuoteInput>(blank());
const reason = ref("");
const error = ref("");

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

watch(
  () => props.view,
  (view) => {
    if (view) Object.assign(form, { ...blank(), ...view.input });
    reason.value = "";
    error.value = "";
  },
  { immediate: true }
);

const preview = computed<{ fees: FeeBreakdown | null; error: string | null }>(() => {
  try {
    return { fees: priceQuote(form), error: null };
  } catch (e) {
    return { fees: null, error: e instanceof PricingError ? e.message : "试算失败" };
  }
});

const delta = computed(() =>
  preview.value.fees && props.view ? preview.value.fees.total - props.view.fees.total : null
);

const canSubmit = computed(() => reason.value.trim().length > 0 && preview.value.fees !== null);

function confirm() {
  if (!props.view) return;
  if (!reason.value.trim()) {
    error.value = "改价必须填写原因";
    return;
  }
  if (!preview.value.fees) {
    error.value = preview.value.error ?? "试算失败";
    return;
  }
  emit("confirm", props.view.record.id, { ...form, customer: form.customer.trim() }, reason.value);
}
</script>

<template>
  <div v-if="view" class="modal-mask" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h3>改价 · {{ view.input.customer }}（{{ view.fees.routeName }}）</h3>
        <button type="button" class="icon-btn" @click="emit('close')">×</button>
      </header>

      <p class="modal-tip">
        当前为 v{{ view.current?.version }} 版，合计 <b>{{ view.fees.total.toFixed(2) }} 元</b>。
        提交后将生成新版本并留痕，<em>旧版本仍可查看、不会被覆盖或重算</em>。
      </p>

      <div class="modal-grid">
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
          重量费折扣
          <select v-model.number="form.discountRate">
            <option :value="1">无折扣</option>
            <option :value="0.95">95 折</option>
            <option :value="0.9">9 折</option>
            <option :value="0.85">85 折</option>
            <option :value="0.8">8 折</option>
          </select>
        </label>
      </div>

      <label class="reason">
        改价原因 <em>*</em>
        <textarea
          v-model="reason"
          placeholder="必填，例如：客户签约月结协议，按 9 折重新核价"
        />
      </label>
      <p v-if="error" class="form-error">{{ error }}</p>

      <FeeBreakdownCard v-if="preview.fees" :fees="preview.fees" :delta="delta" />
      <p v-else class="form-error">{{ preview.error }}</p>

      <div class="modal-actions">
        <button type="button" :disabled="!canSubmit" @click="confirm">确认改价，生成新版本</button>
        <button type="button" class="secondary" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 51, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}

.modal {
  width: min(680px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: grid;
  gap: 14px;
  box-shadow: 0 24px 60px rgba(23, 32, 51, 0.25);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-head h3 {
  margin: 0;
  font-size: 18px;
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
}

.modal-tip {
  margin: 0;
  font-size: 13px;
  color: #5b667a;
  background: #eef5fb;
  border-radius: 8px;
  padding: 10px 12px;
}

.modal-tip em {
  font-style: normal;
  color: #176b87;
}

.modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-grid label,
.reason {
  display: grid;
  gap: 6px;
  color: #445069;
  font-size: 13px;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cfd8e5;
  border-radius: 8px;
  padding: 9px 11px;
  background: #fbfcfe;
  color: #172033;
  font: inherit;
}

.reason textarea {
  min-height: 72px;
  resize: vertical;
}

.reason em {
  color: #c0392b;
  font-style: normal;
}

.form-error {
  margin: 0;
  color: #c0392b;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 560px) {
  .modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
