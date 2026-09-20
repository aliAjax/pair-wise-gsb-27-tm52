import { calculate, applyManualPrice, diffFromPrevious } from "../src/rules/pricing";
import { findRoute, RULE_VERSION } from "../src/rules/catalog";
import { buildSeedQuotes } from "../src/storage/seed";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}\n  expected ${e}\n  got      ${a}`);
  }
}

// 1) 实重主导：上海-南京，180kg, 0.8m³ → 体积重160，实重大→180kg；高于起计100
//    档位 4.2 × 180 = 756；折扣0.9 → 680.4；燃油 (680.4+0)*0.08=54.432→54.43；合计 734.83
const r1 = findRoute("sh-nj");
const c1 = calculate(r1, { routeId: "sh-nj", actualWeight: 180, volume: 0.8, extraFee: 0 }, RULE_VERSION).fees;
check("实重主导-体积重", c1.volumetricWeight, 160);
check("实重主导-计费重", c1.billingWeight, 180);
check("实重主导-重量费", c1.weightFee, 756);
check("实重主导-折后重量费", c1.discountedWeightFee, 680.4);
check("实重主导-燃油最后加", c1.fuelSurcharge, 54.43);
check("实重主导-合计", c1.total, 734.83);
check("实重主导-未触发起计", c1.floorApplied, false);

// 2) 体积重主导 + 起计重量：杭州-合肥，95kg, 0.2m³ → 体积重40，实重95；低于起计80? 95>80 → 不起计
//    档位5.1×95=484.5；折扣0.88→426.36；附加费30 → 燃油基数456.36 ×0.1=45.64；合计502.00
const r2 = findRoute("hz-hf");
const c2 = calculate(r2, { routeId: "hz-hf", actualWeight: 95, volume: 0.2, extraFee: 30 }, RULE_VERSION).fees;
check("附加费-体积重", c2.volumetricWeight, 40);
check("附加费-计费重", c2.billingWeight, 95);
check("附加费-燃油含附加费基数", c2.fuelSurcharge, 45.64);
check("附加费-合计", c2.total, 502);

// 3) 起计重量生效：广州-成都，50kg, 0.1m³ → 体积重20；低于起计150 → 计费重150
const r3 = findRoute("gz-cd");
const c3 = calculate(r3, { routeId: "gz-cd", actualWeight: 50, volume: 0.1, extraFee: 0 }, RULE_VERSION).fees;
check("起计-触发", c3.floorApplied, true);
check("起计-计费重=150", c3.billingWeight, 150);

// 4) 体积重主导：0.1kg实重，2m³ → 体积重400
const c4 = calculate(r3, { routeId: "gz-cd", actualWeight: 0.1, volume: 2, extraFee: 0 }, RULE_VERSION).fees;
check("泡货-体积重主导", c4.billingWeight, 400);

// 5) 档位边界：上海-南京 300kg 落普货档（区间[300,1000)）
const c5 = calculate(r1, { routeId: "sh-nj", actualWeight: 300, volume: 0, extraFee: 0 }, RULE_VERSION).fees;
check("档位-300kg命中普货档", c5.unitPrice, 3.6);
const c5b = calculate(r1, { routeId: "sh-nj", actualWeight: 299.99, volume: 0, extraFee: 0 }, RULE_VERSION).fees;
check("档位-299.99kg轻货档", c5b.unitPrice, 4.2);

// 6) 无折扣场景 discountRate=1，燃油仍最后加
const c6 = calculate(r1, { routeId: "sh-nj", actualWeight: 180, volume: 0, extraFee: 10, discountRate: 1, fuelRate: 0.08 }, RULE_VERSION).fees;
check("无折扣-重量费", c6.discountedWeightFee, 756);
check("无折扣-燃油基数含附加费", c6.fuelSurcharge, Math.round((756 + 10) * 0.08 * 100) / 100);

// 7) 手动改价留痕：把 c2 的 502 改成 430
const m = applyManualPrice(c2, 430);
check("改价-合计=430", m.total, 430);
check("改价-调整额", m.manualAdjustment, -72);
check("改价-自动口径不变", m.fuelSurcharge, 45.64);
check("改价-差额相对上版", diffFromPrevious(c2, m), -72);

// 8) 种子数据：旧记录冻结、版本链完整
const seeds = buildSeedQuotes();
check("种子-3条", seeds.length, 3);
const seed2 = seeds[1];
check("种子-改价单2个版本", seed2.versions.length, 2);
check("种子-v2人工改价合计", seed2.versions[1].fees.total, 430);
check("种子-v1原样保留", seed2.versions[0].frozen, true);
check("种子-留痕含改价原因", seed2.events.some((e) => e.action === "改价留痕" && e.detail?.includes("协议价")), true);
const seed3 = seeds[2];
check("种子-草稿不冻结", seed3.versions[0].frozen, false);
// 广州-成都 120kg/1.1m³: 体积重220>120>起计150 → 220kg × 6.8 = 1496
check("种子-草稿泡货计费重", seed3.versions[0].fees.billingWeight, 220);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
