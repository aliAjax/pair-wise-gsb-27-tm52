# 报价核价与改价留痕台（原物流费用试算器）

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 规则/流程校验：`npx esbuild scripts/verify-pricing.ts --bundle --platform=node --format=esm --outfile=/tmp/p.mjs && node /tmp/p.mjs`，store 流程同理运行 `scripts/verify-store.ts`

数据保存在浏览器 localStorage（报价单与筛选条件各一个 key），刷新后记录、版本链、筛选保持一致。

## 计价口径（规则层固定）

1. 体积重 = 体积(m³) × 200 kg/m³
2. 计费重 = max(实重, 体积重)；低于线路起计重量时按起计重量计
3. 重量费 = 计费重命中的档位单价 × 计费重
4. 折扣只作用于重量费（折后重量费 = 重量费 × 折扣率）
5. 燃油附加费最后加：(折后重量费 + 其他附加费) × 燃油费率

## 核价与改价留痕

- 草稿可反复试算（覆盖唯一草稿版本，不新增版本）；提交核价后费用明细冻结。
- 改价（核价中 / 已核价 / 已报价）必须填写原因，生成新版本；可按输入/折扣/费率重算，也可直接改合计（自动口径保留，差额记为人工调整）。
- 状态流转：草稿 → 待核价 → 已核价 → 已报价 → 已失效；待核价可驳回回草稿（派生新草稿版本，冻结版保留）。
- 列表与状态流转一律读取最新版本；版本链中每个旧版本只读可查。
- 旧记录不重算：存储的是冻结费用明细快照（带规则版本号），线路档位日后调整也不影响历史报价；筛选/刷新均不触发重算。

## 分层结构

- `src/rules/`：规则层。`pricing.ts` 为无副作用计价纯函数；`catalog.ts` 为线路档位目录与规则版本号；`types.ts` 为领域模型。
- `src/storage/`：存储/状态层。`repository.ts` 只管 localStorage 读写；`store.ts`（Pinia）编排版本链、状态流转与筛选；`seed.ts` 构造首启演示数据（算好即冻结）。
- `src/ui/`：界面层。`QuoteForm.vue` 试算录入与实时预览，`FeeTable.vue` 冻结明细展示，`QuoteDrawer.vue` 版本链/改价/留痕，`DraftEditor.vue` 草稿重算。
