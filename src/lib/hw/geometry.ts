export type Mat3 = number[];
export type Pt = [number, number];

/** Lost A·x = b op met Gauss-eliminatie (partiële pivotering). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("Singuliere matrix");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homografie die de vier `src`-punten op de vier `dst`-punten afbeeldt. */
export function homography(src: Pt[], dst: Pt[]): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

export function applyH(H: Mat3, x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Convex omhulsel (monotone chain). */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Kleinste omsluitende rechthoek van een convex omhulsel: [lange zijde, korte zijde]. */
export function minAreaRect(hull: Pt[]): { area: number; long: number; short: number } {
  if (hull.length < 3) return { area: 0, long: 0, short: 0 };
  let best = { area: Infinity, long: 0, short: 0 };
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-9) continue;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [x, y] of hull) {
      const a = x * ux + y * uy;
      const b = -x * uy + y * ux;
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }
    const w = maxA - minA;
    const h = maxB - minB;
    if (w * h < best.area) best = { area: w * h, long: Math.max(w, h), short: Math.min(w, h) };
  }
  return best;
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robuuste lijnfit y = a + b·x (iteratief herwogen, Tukey-gewichten). */
export function robustLine(points: Pt[]): { a: number; b: number } {
  if (points.length === 0) return { a: 0, b: 0 };
  if (points.length === 1) return { a: points[0][1], b: 0 };
  let w = points.map(() => 1);
  let a = 0, b = 0;
  for (let iter = 0; iter < 6; iter++) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    points.forEach(([x, y], i) => {
      sw += w[i]; sx += w[i] * x; sy += w[i] * y; sxx += w[i] * x * x; sxy += w[i] * x * y;
    });
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-9 || sw === 0) {
      b = 0;
      a = sy / (sw || 1);
    } else {
      b = (sw * sxy - sx * sy) / den;
      a = (sy - b * sx) / sw;
    }
    const res = points.map(([x, y]) => Math.abs(y - (a + b * x)));
    const scale = Math.max(1e-6, median(res) * 4.685 * 1.4826);
    w = res.map((r) => (r < scale ? (1 - (r / scale) ** 2) ** 2 : 0));
  }
  // Begrens de helling (handschrift loopt zelden steiler dan ±12°).
  const clamped = Math.max(-0.21, Math.min(0.21, b));
  if (clamped !== b) {
    b = clamped;
    a = median(points.map(([x, y]) => y - b * x));
  }
  return { a, b };
}
