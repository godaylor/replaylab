import type { Pose } from './domain';

// Product-owned, deterministic polyline sampling. No document state or writes.
export function pointOnPath(points: Pose[], progress: number): Pose {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y));
  const length = lengths.reduce((sum, value) => sum + value, 0);
  if (length === 0) return points[0]!;
  let remaining = Math.max(0, Math.min(1, progress)) * length;
  for (let i = 0; i < lengths.length; i++) {
    const segment = lengths[i]!;
    if (remaining <= segment && segment > 0) {
      const a = points[i]!; const b = points[i + 1]!; const ratio = remaining / segment;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= segment;
  }
  return points.at(-1)!;
}
