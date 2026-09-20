/** 展示用格式化（纯函数） */

export function money(value: number): string {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function weight(value: number): string {
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} kg`;
}

export function volume(value: number): string {
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 3 })} m³`;
}

export function percent(rate: number): string {
  return `${round1(rate * 100)}%`;
}

export function discountLabel(rate: number): string {
  if (rate === 1) return "无折扣";
  return `${round1(rate * 100)} 折`;
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function signedMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${money(Math.abs(value))}`;
}
