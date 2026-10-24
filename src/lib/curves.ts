// A curve in numbers (R8, R9): what a result's tiles show of a quantity over time or along atoms.

/** Its mean, standard deviation, lowest, highest and last value, over the points given. */
export function curveStats(points: [number, number][]) {
  if (!points.length) return null;
  const ys = points.map(p => p[1]), mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return { frames: ys.length, mean, sd: Math.sqrt(ys.reduce((a, y) => a + (y - mean) ** 2, 0) / ys.length), min: Math.min(...ys), max: Math.max(...ys), last: ys[ys.length - 1] };
}
