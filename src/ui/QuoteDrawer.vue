<script setup lang="ts">
/** 报价详情抽屉：看版本链、旧报价、留痕事件；改价必须写原因 */
import { computed, reactive, ref, watch } from "vue";
import { ROUTE_RULES, RULE_VERSION } from "../rules/catalog";
import { applyManualPrice, calculate } from "../rules/pricing";
import { useQuoteStore } from "../storage/store";
import type { Quote, QuoteVersion } from "../rules/types";
import FeeTable from "./FeeTable.vue";
import DraftEditor from "./DraftEditor.vue";

const props = defineProps<{ quote: Quote | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const store = useQuoteStore();

const selectedVersionNo = ref<number | null>(null);

const latest = computed<QuoteVersion | null>(() =>
  props.quote ? store.latestVersion(props.quote) : null
);

const viewing = computed<QuoteVersion | null>(() => {
  if (!props.quote) return null;
  const no = selectedVersionNo.value ?? latest.value?.version ?? null;
  return props.quote.versions.find((v) => v.version === no) ?? latest.value;
});

const canRevise = computed(
  () =>
    props.quote &&
    latest.value?.frozen &&
    (props.quote.status === "待核价" ||
      props.quote.status === "已核价" ||
      props.quote.status === "已报价")
);

watch(
  () => props.quote?.id,
  () => {
    selectedVersionNo.value = null;
    resetRevision();
  }
);

// ---- 改价表单 ----
const revision = reactive({
  mode: "auto" as "auto" | "manual",
  reason: "",
  useSameInput: true,
  routeId: "",
  actualWeight: 0,
  volume: 0,
  extraFee: 0,
  discountRatePct: 90,
  fuelRatePct: 8,
  manualTotal: 0,
});

function resetRevision() {
  revision.mode = "auto";
  revision.reason = "";
  revision.useSameInput = true;
  if (latest.value) {
    revision.routeId = latest.value.input.routeId;
    revision.actualWeight = latest.value.input.actualWeight;
    revision.volume = latest.value.input.volume;
    revision.extraFee = latest.value.input.extraFee;
    revision.discountRatePct = +(latest.value.fees.discountRate * 100).toFixed(2);
    revision.fuelRatePct = +(latest.value.fees.fuelRate * 100).toFixed(2);
    revision.manualTotal = latest.value.fees.total;
  }
}

watch(latest, resetRevision);

const revisionPreview = computed(() => {
  if (!canRevise.value || !latest.value) return null;
  try {
    const base = revision.useSameInput && latest.value ? latest.value.input : {
      routeId: revision.routeId,
      actualWeight: Number(revision.actualWeight) || 0,
      volume: Number(revision.volume) || 0,
      extraFee: Number(revision.extraFee) || 0,
    };
    const input = {
      ...base,
      discountRate: revision.discountRatePct / 100,
      fuelRate: revision.fuelRatePct / 100,
    };
    // 复用规则层做预览（不落库）
    const rule = ROUTE_RULES.find((r) => r.id === input.routeId);
    if (!rule) return null;
    let fees = calculate(rule, input, RULE_VERSION).fees;
    if (revision.mode === "manual") {
      fees = applyManualPrice(fees, Number(revision.manualTotal));
    }
    return fees;
  } catch {
    return null;
  }
});

function submitRevision() {
  if (!props.quote) return;
  if (!revision.reason.trim()) {
    window.alert("改价必须填写原因（留痕需要）");
    return;
  }
  try {
    const base = revision.useSameInput && latest.value
      ? latest.value.input
      : {
          routeId: revision.routeId,
          actualWeight: Number(revision.actualWeight) || 0,
          volume: Number(revision.volume) || 0,
          extraFee: Number(revision.extraFee) || 0,
        };
    store.revise({
      id: props.quote.id,
      reason: revision.reason.trim(),
      input: {
        ...base,
        discountRate: revision.discountRatePct / 100,
        fuelRate: revision.fuelRatePct / 100,
      },
      manualTotal: revision.mode === "manual" ? Number(revision.manualTotal) : undefined,
    });
    selectedVersionNo.value = null;
  } catch (e) {
    window.alert((e as Error).message);
  }
}

// ---- 状态流转 / 驳回 ----
function go(target: ReturnType<typeof store.nextActions>[number]) {
  if (!props.quote) return;
  try {
    store.transition(props.quote.id, target);
  } catch (e) {
    window.alert((e as Error).message);
  }
}

const draftVersion = computed(() =>
  props.quote?.versions.find((v) => !v.frozen && v.version === latest.value?.version) ?? null
);

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
function money(v: number) {
  return `¥${v.toFixed(2)}`;
}
</script>

<template>
  <div v-if="quote" class="drawer-mask" @click.self="emit('close')">
    <aside class="drawer">
      <header class="drawer-head">
        <div>
          <h2>{{ quote.customer }}</h2>
          <p class="sub">单号 {{ quote.id }} · 创建 {{ fmtTime(quote.createdAt) }}</p>
        </div>
        <button class="icon-btn" type="button" @click="emit('close')">✕</button>
      </header>

      <div class="drawer-body">
        <!-- 状态与流转 -->
        <section class="block">
          <div class="status-line">
            <span class="status" :class="`st-${quote.status}`">{{ quote.status }}</span>
            <span class="ver-tag">当前版本 v{{ latest?.version }}（{{ latest?.frozen ? "已冻结" : "草稿可改" }}）</span>
          </div>
          <p class="remark" v-if="quote.remark">备注：{{ quote.remark }}</p>
          <div class="actions" v-if="quote.status === '草稿'">
            <button type="button" @click="go('待核价')">提交核价</button>
          </div>
          <div class="actions" v-else>
            <button
              v-for="target in store.nextActions(quote.status)"
              :key="target"
              type="button"
              :class="target === '已失效' ? 'danger' : target === '草稿' ? 'secondary' : ''"
              @click="go(target)"
            >
              {{ target === "草稿" ? "驳回修改" : target === "已核价" ? "核价通过" : target === "已报价" ? "对外报价" : "标记失效" }}
            </button>
          </div>
        </section>

        <!-- 版本链 -->
        <section class="block">
          <h3>版本链（{{ quote.versions.length }} 个版本，旧报价只读）</h3>
          <div class="version-chain">
            <button
              v-for="v in quote.versions"
              :key="v.version"
              type="button"
              class="version-pill"
              :class="{ active: viewing?.version === v.version, current: v.version === latest?.version, frozen: v.frozen }"
              @click="selectedVersionNo = v.version"
            >
              <strong>v{{ v.version }}</strong>
              <span>{{ v.frozen ? "已冻结" : "草稿" }} · {{ v.kind === "manual" ? "人工改价" : v.kind === "system" ? "系统核价" : "草稿试算" }}</span>
              <span>{{ money(v.fees.total) }}</span>
            </button>
          </div>
          <p v-if="viewing" class="version-reason">
            <b>v{{ viewing.version }} 原因：</b>{{ viewing.reason }}
            <span class="dim">— {{ viewing.operator }} · {{ fmtTime(viewing.createdAt) }}</span>
          </p>
          <FeeTable v-if="viewing" :fees="viewing.fees" highlight-total />
          <p v-if="viewing && viewing.version !== latest?.version" class="old-note">
            正在查看历史版本 v{{ viewing.version }}；列表与状态流转以最新版本 v{{ latest?.version }} 为准。
          </p>
        </section>

        <!-- 草稿重算（仅驳回/新建草稿） -->
        <section v-if="draftVersion" class="block">
          <h3>草稿重新试算</h3>
          <DraftEditor :quote="quote" />
        </section>

        <!-- 改价留痕 -->
        <section v-if="canRevise" class="block revise">
          <h3>改价（生成新版本，原因必填）</h3>
          <div class="mode-switch">
            <label><input v-model="revision.mode" type="radio" value="auto" /> 调输入/折扣/费率重算</label>
            <label><input v-model="revision.mode" type="radio" value="manual" /> 直接改合计金额</label>
          </div>
          <label class="checkbox">
            <input v-model="revision.useSameInput" type="checkbox" />
            沿用上版线路、实重、体积与附加费（只改费率）
          </label>
          <div v-if="!revision.useSameInput" class="revise-grid">
            <label>线路
              <select v-model="revision.routeId">
                <option v-for="r in ROUTE_RULES" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </label>
            <label>实重 kg<input v-model.number="revision.actualWeight" type="number" min="0" /></label>
            <label>体积 m³<input v-model.number="revision.volume" type="number" min="0" step="0.01" /></label>
            <label>附加费 元<input v-model.number="revision.extraFee" type="number" min="0" /></label>
          </div>
          <div class="revise-grid">
            <label>折扣率 %（仅重量费）<input v-model.number="revision.discountRatePct" type="number" min="0" max="100" step="0.5" /></label>
            <label>燃油费率 %（最后加）<input v-model.number="revision.fuelRatePct" type="number" min="0" max="100" step="0.5" /></label>
            <label v-if="revision.mode === 'manual'">改后合计 元
              <input v-model.number="revision.manualTotal" type="number" min="0" step="0.01" />
            </label>
          </div>
          <label class="reason-box">
            改价原因（必填，写入留痕）
            <textarea v-model="revision.reason" placeholder="如：客户月发货量达协议门槛，申请协议折扣" />
          </label>
          <div v-if="revisionPreview" class="revise-preview">
            试算结果：自动口径 {{ money(revisionPreview.total - revisionPreview.manualAdjustment) }}
            <template v-if="revisionPreview.manualAdjustment">
              ，人工调整
              <span :class="revisionPreview.manualAdjustment > 0 ? 'up' : 'down'">
                {{ revisionPreview.manualAdjustment > 0 ? "+" : "" }}{{ money(revisionPreview.manualAdjustment) }}
              </span>
            </template>
            ，新版本合计 <b>{{ money(revisionPreview.total) }}</b>
          </div>
          <button type="button" class="revise-btn" @click="submitRevision">确认改价并生成 v{{ (latest?.version ?? 1) + 1 }}</button>
        </section>

        <!-- 留痕事件 -->
        <section class="block">
          <h3>操作留痕</h3>
          <ol class="events">
            <li v-for="(ev, i) in [...quote.events].reverse()" :key="i">
              <span class="ev-time">{{ fmtTime(ev.at) }}</span>
              <span class="ev-action">{{ ev.action }}</span>
              <span class="ev-who">{{ ev.operator }}</span>
              <span v-if="ev.detail" class="ev-detail">{{ ev.detail }}</span>
            </li>
          </ol>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 51, 0.42);
  display: flex;
  justify-content: flex-end;
  z-index: 50;
}
.drawer {
  width: min(640px, 100%);
  height: 100%;
  background: #f5f7fb;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 30px rgba(23, 32, 51, 0.18);
}
.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 20px;
  background: #fff;
  border-bottom: 1px solid #dfe7f1;
}
.drawer-head h2 { margin: 0; font-size: 20px; }
.sub { margin: 4px 0 0; color: #8a94a8; font-size: 12.5px; }
.icon-btn {
  background: #eef2f7;
  color: #536078;
  padding: 6px 10px;
}
.drawer-body {
  padding: 16px 20px 28px;
  overflow-y: auto;
  display: grid;
  gap: 14px;
}
.block {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 14px 16px;
}
.block h3 { margin: 0 0 10px; font-size: 15px; }
.status-line {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.ver-tag { font-size: 12.5px; color: #69758c; }
.remark { margin: 10px 0 0; font-size: 13.5px; color: #445069; }
.actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.version-chain {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.version-pill {
  flex: 0 0 auto;
  display: grid;
  gap: 2px;
  text-align: left;
  background: #fbfcfe;
  border: 1px solid #d3dcea;
  color: #445069;
  padding: 8px 12px;
  border-radius: 10px;
  min-width: 150px;
}
.version-pill span { font-size: 11.5px; color: #8a94a8; }
.version-pill.active { border-color: #176b87; box-shadow: 0 0 0 2px rgba(23, 107, 135, 0.15); }
.version-pill.current { background: #f0f8f6; }
.version-pill.frozen strong::after { content: " 🔒"; font-size: 11px; }
.version-reason {
  font-size: 13px;
  color: #445069;
  background: #eef5fb;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 4px 0 10px;
}
.dim { color: #8a94a8; }
.old-note {
  margin: 10px 0 0;
  padding: 8px 10px;
  font-size: 12.5px;
  color: #8a6d1d;
  background: #fdf6e3;
  border-radius: 8px;
}
.mode-switch {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 13.5px;
}
.checkbox { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 6px 0; }
.checkbox input { width: auto; }
.revise-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.revise-grid label { font-size: 12.5px; }
.reason-box { display: grid; gap: 6px; margin-top: 10px; font-size: 13.5px; }
.revise-preview {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f0f8f6;
  border-radius: 8px;
  font-size: 13px;
}
.up { color: #c84b31; font-weight: 700; }
.down { color: #14724f; font-weight: 700; }
.revise-btn { margin-top: 12px; width: 100%; }
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.events li {
  display: grid;
  grid-template-columns: 160px 90px 90px 1fr;
  gap: 8px;
  font-size: 12.5px;
  align-items: baseline;
}
.ev-time { color: #8a94a8; }
.ev-action { font-weight: 700; color: #176b87; }
.ev-who { color: #536078; }
.ev-detail { color: #69758c; }
.status {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12.5px;
  white-space: nowrap;
}
.st-草稿 { background: #eef2f7; color: #536078; }
.st-待核价 { background: #fdf6e3; color: #8a6d1d; }
.st-已核价 { background: #e8f4ef; color: #14724f; }
.st-已报价 { background: #e6f0fb; color: #1a5fb4; }
.st-已失效 { background: #fbeae6; color: #c84b31; }
@media (max-width: 560px) {
  .revise-grid { grid-template-columns: 1fr 1fr; }
  .events li { grid-template-columns: 1fr; gap: 2px; }
}
</style>
