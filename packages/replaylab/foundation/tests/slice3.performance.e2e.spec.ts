import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

function percentile(values: number[], ratio: number) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)] ?? Number.POSITIVE_INFINITY;
}

test('30-second maximum-scene playback and memory soak meet Slice 3 budgets', async ({ browser, page }) => {
  test.setTimeout(55_000);
  await page.goto(`/app/play/slice3-performance/edit?db=replaylab-slice3-performance-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp?.playbackController));

  await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    while (facade.snapshot.phases.length < 12) {
      facade.addPhaseAfter(facade.snapshot.phases.length - 1);
    }
    facade.snapshot.phases.forEach((_, phaseIndex) => {
      facade.setActorPose({
        phaseIndex,
        actorId: 'offense-1',
        x: Math.min(800, 110 + phaseIndex * 45),
        y: 125 + (phaseIndex % 3) * 35,
      });
    });
    const phase = facade.snapshot.phases[0]!;
    const actors = ['offense-1', 'offense-2', 'offense-3', 'offense-4', 'offense-5'] as const;
    for (let index = 0; index < 30; index += 1) {
      const actorId = actors[index % actors.length]!;
      facade.createAction({
        actorId,
        type: index % 2 ? 'dribble' : 'cut',
        path: {
          points: [
            phase.poses[actorId],
            { x: 180 + index * 10, y: 155 + (index % 5) * 34 },
          ],
        },
      });
    }
  });

  const trace = await page.evaluate(async ({ warmupMs, traceMs }) => {
    const controller = window.replayLabApp!.playbackController!;
    const shell = document.querySelector<HTMLElement>('[data-app-ready="true"]')!;
    const canvas = document.querySelector<HTMLCanvasElement>('#court')!;
    const longTasksMs: number[] = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasksMs.push(entry.duration);
    });
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { observer.disconnect(); }
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };

    const run = (durationMs: number, collect: boolean) =>
      new Promise<{ intervals: number[]; elapsedMs: number; frames: number }>(resolveRun => {
        const intervals: number[] = [];
        const startedAt = performance.now();
        let previous = startedAt;
        let frames = 0;
        const tick = (now: number) => {
          if (collect && frames > 0) intervals.push(now - previous);
          previous = now;
          frames += 1;
          controller.scrub((now - startedAt) % Math.max(1, controller.totalDurationMs));
          if (now - startedAt < durationMs) requestAnimationFrame(tick);
          else resolveRun({ intervals, elapsedMs: now - startedAt, frames });
        };
        requestAnimationFrame(tick);
      });

    await run(warmupMs, false);
    longTasksMs.length = 0;
    const heapBefore = memory.memory?.usedJSHeapSize ?? null;
    const reactBefore = Number(shell.dataset.reactRenderCount);
    const rendersBefore = Number(canvas.dataset.renderCount);
    const measured = await run(traceMs, true);
    await new Promise<void>(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint())));
    const heapAfter = memory.memory?.usedJSHeapSize ?? null;
    observer.disconnect();
    return {
      ...measured,
      heapBefore,
      heapAfter,
      reactBefore,
      reactAfter: Number(shell.dataset.reactRenderCount),
      renders: Number(canvas.dataset.renderCount) - rendersBefore,
      longTasksMs,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      phases: window.replayLabApp!.facade.snapshot.phases.length,
      actors: window.replayLabApp!.facade.snapshot.actors.length,
      actions: window.replayLabApp!.facade.snapshot.actions.length,
    };
  }, { warmupMs: 5_000, traceMs: 30_000 });

  const fps = (trace.frames * 1000) / trace.elapsedMs;
  const frameP95Ms = percentile(trace.intervals, 0.95);
  const heapDeltaBytes =
    trace.heapBefore === null || trace.heapAfter === null
      ? null
      : trace.heapAfter - trace.heapBefore;
  const report = {
    generatedAt: new Date().toISOString(),
    verdict:
      fps >= 55 &&
      trace.phases === 12 &&
      trace.actors === 10 &&
      trace.actions === 30 &&
      trace.reactBefore === trace.reactAfter &&
      (heapDeltaBytes === null || heapDeltaBytes < 64 * 1024 * 1024)
        ? 'PASS'
        : 'FAIL',
    profile: {
      id: 'replaylab-render-v1',
      browserVersion: browser.version(),
      viewport: trace.viewport,
      runner: {
        platform: platform(),
        release: release(),
        logicalCpuCount: cpus().length,
        cpuModel: cpus()[0]?.model ?? 'unknown',
        totalMemoryBytes: totalmem(),
        execution: 'local controlled gate; canonical dedicated CI replay remains required',
      },
      warmupMs: 5_000,
      traceAndSoakMs: 30_000,
    },
    fixture: { phases: trace.phases, actors: trace.actors, derivedBall: 1, visibleActions: trace.actions },
    metrics: {
      framesPerSecond: fps,
      frameIntervalP95Ms: frameP95Ms,
      gfxRenders: trace.renders,
      reactRendersDuringPlayback: trace.reactAfter - trace.reactBefore,
      longTaskCount: trace.longTasksMs.length,
      longestTaskMs: Math.max(0, ...trace.longTasksMs),
      heapBeforeBytes: trace.heapBefore,
      heapAfterBytes: trace.heapAfter,
      heapDeltaBytes,
    },
    budgets: { minimumFramesPerSecond: 55, maximumHeapGrowthBytes: 64 * 1024 * 1024 },
    userAgent: trace.userAgent,
  };

  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, 'slice3-performance.json'), JSON.stringify(report, null, 2) + '\n');
  expect(fps).toBeGreaterThanOrEqual(55);
  expect(trace.phases).toBe(12);
  expect(trace.actors).toBe(10);
  expect(trace.actions).toBe(30);
  expect(trace.reactAfter).toBe(trace.reactBefore);
  if (heapDeltaBytes !== null) expect(heapDeltaBytes).toBeLessThan(64 * 1024 * 1024);
});
