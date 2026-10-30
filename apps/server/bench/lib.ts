export function pct(xs: number[], p: number) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
}
export function summary(xs: number[]) {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { n: xs.length, p50: r(pct(xs, 50)), p95: r(pct(xs, 95)), p99: r(pct(xs, 99)), max: r(Math.max(...xs)), mean: r(xs.reduce((a, b) => a + b, 0) / xs.length) };
}
