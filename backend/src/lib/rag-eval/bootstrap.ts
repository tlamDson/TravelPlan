/**
 * Cluster (city) bootstrap for 95% CIs. Queries from one city share a
 * corpus slice, so they aren't independent — resampling whole cities is
 * the honest unit. For a paired delta, pass per-query differences (b − a);
 * resampling them by city is the paired bootstrap.
 */

/** Small, fast, seedable PRNG — results must be reproducible from the seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClusteredValue {
  cluster: string;
  value: number;
}

export interface MeanCI {
  mean: number;
  ci95: [number, number];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const round = (x: number) => Math.round(x * 1e12) / 1e12;

export function clusterBootstrap(
  values: ClusteredValue[],
  opts: { B: number; seed: number },
): MeanCI {
  if (values.length === 0) throw new Error("clusterBootstrap: empty input");
  const groups = new Map<string, { sum: number; n: number }>();
  for (const { cluster, value } of values) {
    const g = groups.get(cluster) ?? { sum: 0, n: 0 };
    g.sum += value;
    g.n += 1;
    groups.set(cluster, g);
  }
  const clusters = [...groups.keys()].sort().map((k) => groups.get(k)!);
  const mean = values.reduce((s, v) => s + v.value, 0) / values.length;

  const rand = mulberry32(opts.seed);
  const stats: number[] = [];
  for (let b = 0; b < opts.B; b++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[Math.floor(rand() * clusters.length)]!;
      sum += c.sum;
      n += c.n;
    }
    stats.push(sum / n);
  }
  stats.sort((a, b) => a - b);
  // Rounded so float noise doesn't turn a zero-width interval into [x−ε, x].
  return {
    mean: round(mean),
    ci95: [round(quantile(stats, 0.025)), round(quantile(stats, 0.975))],
  };
}
