import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)]!;
}

test('30-second maximum Slice 2A fixture trace meets the pinned render budgets', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const database = 'replaylab-perf-' + Date.now();
  await page.goto('/app/play/performance/edit?db=' + database);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));

  await page.evaluate(async () => {
    const facade = window.replayLabApp?.facade;
    if (!facade) throw new Error('Missing ReplayLab facade');
    while (facade.snapshot.phases.length < 12) {
      facade.addPhaseAfter(facade.snapshot.phases.length - 1);
    }
    const phase = facade.snapshot.phases[0]!;
    const offenseIds = ['offense-1', 'offense-2', 'offense-3', 'offense-4', 'offense-5'] as const;
    for (let index = 0; index < 30; index += 1) {
      const actorId = offenseIds[index % offenseIds.length]!;
      facade.createAction({
        actorId,
        type: index % 2 === 0 ? 'cut' : 'dribble',
        path: { points: [phase.poses[actorId], { x: 180 + index * 10, y: 180 + (index % 5) * 25 }] },
      });
    }
    await facade.flush();
  });
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '12');

  const canvas = page.locator('#court');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Court has no visible bounds');
  const start = {
    x: bounds.x + (110 / 840) * bounds.width,
    y: bounds.y + (125 / 460) * bounds.height,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  const trace = await page.evaluate(async ({ warmupMs, traceMs }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#court');
    const shell = document.querySelector<HTMLElement>('[data-app-ready="true"]');
    if (!canvas || !shell) throw new Error('Missing render targets');
    const rect = canvas.getBoundingClientRect();
    let latestInputAt: number | null = null;
    let collect = false;
    const inputToPaintMs: number[] = [];
    const longTasksMs: number[] = [];

    const mutationObserver = new MutationObserver(() => {
      if (collect && latestInputAt !== null) {
        inputToPaintMs.push(performance.now() - latestInputAt);
        latestInputAt = null;
      }
    });
    mutationObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ['data-render-count'],
    });

    const longTaskObserver =
      typeof PerformanceObserver === 'undefined'
        ? null
        : new PerformanceObserver(list => {
            if (collect) {
              for (const entry of list.getEntries()) longTasksMs.push(entry.duration);
            }
          });
    try {
      longTaskObserver?.observe({ entryTypes: ['longtask'] });
    } catch {
      longTaskObserver?.disconnect();
    }

    const dispatchFrame = (elapsed: number) => {
      const angle = (elapsed / 1000) * Math.PI * 1.5;
      const courtX = 180 + Math.cos(angle) * 55;
      const courtY = 170 + Math.sin(angle) * 45;
      latestInputAt = performance.now();
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + (courtX / canvas.width) * rect.width,
          clientY: rect.top + (courtY / canvas.height) * rect.height,
          pointerId: 1,
          pointerType: 'mouse',
          buttons: 1,
        })
      );
    };

    const run = (durationMs: number, recordIntervals: boolean) =>
      new Promise<{ frameIntervalsMs: number[]; frames: number; elapsedMs: number }>(
        resolveRun => {
          const frameIntervalsMs: number[] = [];
          const startedAt = performance.now();
          let previousFrameAt = startedAt;
          let frames = 0;
          const tick = (now: number) => {
            if (recordIntervals && frames > 0) {
              frameIntervalsMs.push(now - previousFrameAt);
            }
            previousFrameAt = now;
            frames += 1;
            dispatchFrame(now - startedAt);
            if (now - startedAt < durationMs) {
              requestAnimationFrame(tick);
            } else {
              resolveRun({
                frameIntervalsMs,
                frames,
                elapsedMs: now - startedAt,
              });
            }
          };
          requestAnimationFrame(tick);
        }
      );

    await run(warmupMs, false);
    inputToPaintMs.length = 0;
    longTasksMs.length = 0;
    latestInputAt = null;
    collect = true;
    const reactRenderCountBefore = Number(shell.dataset.reactRenderCount);
    const gfxRenderCountBefore = Number(canvas.dataset.renderCount);
    const measured = await run(traceMs, true);
    await new Promise<void>(resolvePaint =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
    );
    collect = false;
    const reactRenderCountAfter = Number(shell.dataset.reactRenderCount);
    const gfxRenderCountAfter = Number(canvas.dataset.renderCount);
    mutationObserver.disconnect();
    longTaskObserver?.disconnect();

    const openEntry = performance.getEntriesByName('replaylab-local-open').at(-1);
    return {
      ...measured,
      inputToPaintMs,
      longTasksMs,
      reactRenderCountBefore,
      reactRenderCountAfter,
      gfxRenderCountBefore,
      gfxRenderCountAfter,
      localOpenMs: openEntry?.duration ?? Number.POSITIVE_INFINITY,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      userAgent: navigator.userAgent,
      phaseCount: window.replayLabApp?.facade.snapshot.phases.length ?? 0,
      actorCount: window.replayLabApp?.facade.snapshot.actors.length ?? 0,
      actionCount: window.replayLabApp?.facade.snapshot.actions.length ?? 0,
    };
  }, { warmupMs: 5_000, traceMs: 30_000 });

  await page.mouse.move(
    bounds.x + (180 / 840) * bounds.width,
    bounds.y + (170 / 460) * bounds.height
  );
  await page.mouse.up();

  const framesPerSecond = (trace.frames * 1000) / trace.elapsedMs;
  const frameIntervalP95Ms = percentile(trace.frameIntervalsMs, 0.95);
  const inputToPaintP95Ms = percentile(trace.inputToPaintMs, 0.95);
  const report = {
    generatedAt: new Date().toISOString(),
    verdict:
      framesPerSecond >= 55 &&
      inputToPaintP95Ms < 50 &&
      trace.localOpenMs < 1_500 &&
      trace.reactRenderCountBefore === trace.reactRenderCountAfter &&
      trace.phaseCount === 12 &&
      trace.actorCount === 10 &&
      trace.actionCount === 30
        ? 'PASS'
        : 'FAIL',
    profile: {
      id: 'replaylab-render-v1',
      target: 'Playwright 1.58.2 pinned Chromium; dedicated 4-vCPU/8-GB CI runner',
      browserVersion: browser.version(),
      viewport: trace.viewport,
      devicePixelRatio: trace.devicePixelRatio,
      workerCount: 1,
      warmupMs: 5_000,
      traceMs: 30_000,
      runner: {
        platform: platform(),
        release: release(),
        logicalCpuCount: cpus().length,
        cpuModel: cpus()[0]?.model ?? 'unknown',
        totalMemoryBytes: totalmem(),
        execution: 'local controlled gate; canonical dedicated CI replay remains required',
      },
    },
    fixture: {
      phases: trace.phaseCount,
      actors: trace.actorCount,
      derivedBall: 1,
      actionsPerTransition: trace.actionCount,
      note: 'Slice 2A maximum path projection fixture for one visible transition.',
    },
    metrics: {
      frames: trace.frames,
      elapsedMs: trace.elapsedMs,
      framesPerSecond,
      frameIntervalP95Ms,
      inputSamples: trace.inputToPaintMs.length,
      inputToPaintP95Ms,
      localOpenMs: trace.localOpenMs,
      longTaskCount: trace.longTasksMs.length,
      longestTaskMs: Math.max(0, ...trace.longTasksMs),
      gfxRenders: trace.gfxRenderCountAfter - trace.gfxRenderCountBefore,
      reactRendersDuringPointerMoves:
        trace.reactRenderCountAfter - trace.reactRenderCountBefore,
    },
    budgets: {
      minimumFramesPerSecond: 55,
      maximumInputToPaintP95Ms: 50,
      maximumLocalOpenMs: 1_500,
      maximumReactRendersDuringPointerMoves: 0,
    },
    userAgent: trace.userAgent,
  };

  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    resolve(evidenceRoot, 'slice2a-performance.json'),
    JSON.stringify(report, null, 2) + String.fromCharCode(10)
  );

  expect(trace.phaseCount).toBe(12);
  expect(trace.actorCount).toBe(10);
  expect(framesPerSecond).toBeGreaterThanOrEqual(55);
  expect(inputToPaintP95Ms).toBeLessThan(50);
  expect(trace.localOpenMs).toBeLessThan(1_500);
  expect(trace.actionCount).toBe(30);
  expect(trace.reactRenderCountAfter).toBe(trace.reactRenderCountBefore);
  expect(trace.gfxRenderCountAfter).toBeGreaterThan(trace.gfxRenderCountBefore);
});
