# 报价核价与改价留痕台

由「物流费用试算器」演进而来的报价核价与改价留痕台，纯前端实现，数据保存在浏览器 localStorage。

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript、Pinia、Element Plus
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 规则自检：`npx esbuild scripts/check-pricing.ts --bundle --platform=node --format=esm | node --input-type=module`
- 留痕自检：`npx esbuild scripts/check-store.ts --bundle --platform=node --format=esm | node --input-type=module`

## 计价规则

每笔报价按「线路、实重、体积、重量档位」计价：

1. 体积重 = 体积(m³) × **200 kg/m³**
2. 计费重 = max(实重, 体积重)；**低于线路起计重量按起计重量**
3. 按计费重落入线路重量档位，以档位单价计重量费
4. **折扣只作用于重量费**，不作用于燃油
5. **燃油附加费 = 折后重量费 × 线路燃油费率，最后加总**

规则集中在 `src/rules/pricing.ts`（纯函数，带 `RULES_VERSION`），调整档位、费率只改这一处。

## 核价、改价与留痕

- **待核价草稿**：试算结果只存在草稿上，可反复编辑、按当前规则重算，不进版本链。
- **核价**：把草稿的输入与费用明细**冻结为 v1**（kind=核价，记录核价说明与操作人），此后不可变。
- **改价**：已核价单据可改价，**必须填写改价原因**；按当前输入与规则重新计价并**追加新版本（v2、v3…）**。旧版本原样保留、不覆盖、不重算。
- **版本链**：右侧抽屉可查全部历史版本（含改价原因、操作人、时间、冻结明细，以及相邻版本差额）。
- **状态流转**：待核价 → 已核价 → 已改价 → 已关闭；状态挂在单据上，流转不产生费用版本，关键两步必须走「核价 / 改价」动作。
- 列表、筛选、指标、图表**统一读取最新版本**（待核价单读草稿试算）。
- 刷新后报价记录、版本链、筛选条件保持一致；**旧记录不随规则调整重算**（费用明细是写入时的快照，含规则版本号）。

## 分层结构

```
src/
├─ rules/      规则层：计价引擎（纯函数，无存储/界面依赖）
│  └─ pricing.ts
├─ models/     领域模型：报价单、版本链、最新口径视图
│  └─ quote.ts
├─ storage/    存储层：localStorage 仓储、偏好与种子数据（历史快照只读出不重算）
│  └─ repository.ts
├─ stores/     编排层：Pinia store（草稿/核价冻结/改价追加版本/筛选/状态流转）
│  └─ quoteStore.ts
├─ components/ 界面层：试算表单、报价列表、改价弹窗、版本链抽屉、费用明细卡
│  ├─ QuoteForm.vue
│  ├─ QuoteList.vue
│  ├─ RepriceDialog.vue
│  ├─ VersionDrawer.vue
│  └─ FeeBreakdownCard.vue
├─ utils/      展示格式化
└─ App.vue     装配
```

数据键：`hxwl-quote-console:quotes:v1`（单据+版本链）、`hxwl-quote-console:prefs:v1`（筛选与操作人）。
