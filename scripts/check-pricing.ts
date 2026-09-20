import { priceQuote, calcVolumeWeight, ROUTES, findRoute } from "../src/rules/pricing";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

// 体积重: 0.6m3 * 200 = 120kg
check("volume weight", calcVolumeWeight(0.6), 120);

// 实重 180 > 体积重 120，计费重 180；上海-南京 180 落 <=300 档 3.9/kg
// 重量费 702，无折扣，燃油 12% = 84.24，合计 786.24
{
  const f = priceQuote({ routeCode: "SH-NJ", actualWeightKg: 180, volumeM3: 0.6, discountRate: 1 });
  check("actual dominates", f.chargeWeightKg, 180);
  check("actual basis", f.chargeWeightBasis, "实重");
  check("tier price", f.unitPrice, 3.9);
  check("raw weight fee", f.weightFeeRaw, 702);
  check("weight fee", f.weightFee, 702);
  check("fuel", f.fuelSurcharge, 84.24);
  check("total", f.total, 786.24);
}

// 体积重大于实重: 实重 50, 体积 0.5m3 -> 100kg
{
  const f = priceQuote({ routeCode: "GZ-SZ", actualWeightKg: 50, volumeM3: 0.5, discountRate: 1 });
  check("vol dominates", f.chargeWeightKg, 100);
  check("vol basis", f.chargeWeightBasis, "体积重");
}

// 低于起计重量: 北京-天津 起计20; 实重5 体积0 -> 计费重20
{
  const f = priceQuote({ routeCode: "BJ-TJ", actualWeightKg: 5, volumeM3: 0, discountRate: 1 });
  check("min charge", f.chargeWeightKg, 20);
  check("min basis", f.chargeWeightBasis, "起计重量");
  // 20kg 在 <=100 档 3.2 -> 64; 燃油 11% -> 7.04; 总 71.04
  check("min total", f.total, 71.04);
}

// 折扣只作用重量费：杭州-合肥 95kg 实重，0.2m3=40 体积重，取95；<=100 档 5.6
// 原价 532；95 折 -> 505.4；燃油 14% 按折后 -> 70.756 -> 70.76；总 576.16
{
  const f = priceQuote({ routeCode: "HZ-HF", actualWeightKg: 95, volumeM3: 0.2, discountRate: 0.95 });
  check("disc raw", f.weightFeeRaw, 532);
  check("disc weight fee", f.weightFee, 505.4);
  check("disc fuel on discounted", f.fuelSurcharge, 70.76);
  check("disc total", f.total, 576.16);
  // 若燃油按原价算会是 74.48 -> 确认不是
  if (f.fuelSurcharge === 74.48) {
    fail++;
    console.error("FAIL fuel must be computed on discounted weight fee");
  } else {
    pass++;
  }
}

// 跨档: 上海-南京 350kg -> <=1000 档 3.6
{
  const f = priceQuote({ routeCode: "SH-NJ", actualWeightKg: 350, volumeM3: 0, discountRate: 1 });
  check("upper tier", f.unitPrice, 3.6);
  check("upper tier total", f.total, Math.round(350 * 3.6 * 1.12 * 100) / 100);
}

// 超大重量落最高档
{
  const f = priceQuote({ routeCode: "GZ-SZ", actualWeightKg: 5000, volumeM3: 0, discountRate: 1 });
  check("top tier price", f.unitPrice, 2.0);
}

// 非法输入
try {
  priceQuote({ routeCode: "NOPE", actualWeightKg: 1, volumeM3: 1, discountRate: 1 });
  fail++;
  console.error("FAIL unknown route should throw");
} catch {
  pass++;
}
try {
  priceQuote({ routeCode: "SH-NJ", actualWeightKg: 1, volumeM3: 1, discountRate: 1.2 });
  fail++;
  console.error("FAIL bad discount should throw");
} catch {
  pass++;
}

check("routes count", ROUTES.length, 4);
check("findRoute", findRoute("SH-NJ").name, "上海-南京");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
