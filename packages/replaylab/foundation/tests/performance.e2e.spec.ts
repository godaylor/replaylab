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

for (const presentation of ['plan', '3d'] as const) {
test(`30-second maximum ${presentation === 'plan' ? 'Slice 2A plan' : 'Watch 3D'} fixture trace meets the pinned render budgets`, async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const database = `replaylab-perf-${presentation}-` + Date.now();
  await page.goto('/app/play/performance/edit?db=' + database + (presentation === '3d' ? '&watch=1' : '&view=plan'));
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));

  await page.evaluate(async mode => {
    const facade = window.replayLabApp?.facade;
    if (!facade) throw new Error('Missing ReplayLab facade');
    while (facade.snapshot.phases.length < 12) {
      facade.addPhaseAfter(facade.snapshot.phases.length - 1);
    }
    if (mode === '3d') {
      // A moving maximum scene keeps all thirty paths visible in the first
      // transition. Twelve canonical phases remain loaded throughout the soak.
      for (const actor of facade.snapshot.actors) {
        const pose = facade.snapshot.phases[0]!.poses[actor.id];
        facade.setActorPose({ phaseIndex: 1, actorId: actor.id, x: Math.min(800, pose.x + 80), y: Math.min(420, pose.y + 25) });
      }
    }
    const phase = facade.snapshot.phases[0]!;
    const offenseIds = ['offense-1', 'offense-2', 'offense-3', 'offense-4', 'offense-5'] as const;
    for (let index = 0; index < 30; index += 1) {
      const actorId = offenseIds[index % offenseIds.length]!;
      const startPose = phase.poses[actorId];
      const endpoint = { x: 180 + index * 10, y: 180 + (index % 5) * 25 };
      const points = mode === '3d'
        ? Array.from({ length: 64 }, (_, pointIndex) => ({
            x: startPose.x + (endpoint.x - startPose.x) * pointIndex / 63,
            y: startPose.y + (endpoint.y - startPose.y) * pointIndex / 63,
          }))
        : [startPose, endpoint];
      facade.createAction({
        actorId,
        type: index % 2 === 0 ? 'cut' : 'dribble',
        path: { points },
      });
    }
    await facade.flush();
  }, presentation);
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '12');

  const canvas = page.locator('#court');
  await expect(canvas).toHaveAttribute('data-presentation', presentation);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Court has no visible bounds');
  const start = {
    x: bounds.x + (110 / 840) * bounds.width,
    y: bounds.y + (125 / 460) * bounds.height,
  };
  if (presentation === 'plan') {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
  }

  const trace = await page.evaluate(async ({ warmupMs, traceMs, mode }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#court');
    const shell = document.querySelector<HTMLElement>('[data-app-ready="true"]');
    if (!canvas || !shell) throw new Error('Missing render targets');
    const rect = canvas.getBoundingClientRect();
    let latestInputAt: number | null = null;
    let collect = false;
    const inputToPaintMs: number[] = [];
    const longTasksMs: number[] = [];
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const controller = window.replayLabApp?.playbackController;
    if (mode === '3d' && !controller) throw new Error('Missing 3D playback controller');

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
      if (mode === '3d') {
        const phase = window.replayLabApp!.facade.snapshot.phases[0]!;
        latestInputAt = performance.now();
        controller!.scrub(phase.holdMs + 1 + elapsed % Math.max(1, phase.durationMs - 2));
        return;
      }
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
    const heapBeforeBytes = memory.memory?.usedJSHeapSize ?? null;
    const measured = await run(traceMs, true);
    await new Promise<void>(resolvePaint =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
    );
    collect = false;
    const reactRenderCountAfter = Number(shell.dataset.reactRenderCount);
    const gfxRenderCountAfter = Number(canvas.dataset.renderCount);
    const heapAfterBytes = memory.memory?.usedJSHeapSize ?? null;
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
      heapBeforeBytes,
      heapAfterBytes,
      presentation: canvas.dataset.presentation,
      localOpenMs: openEntry?.duration ?? Number.POSITIVE_INFINITY,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      userAgent: navigator.userAgent,
      phaseCount: window.replayLabApp?.facade.snapshot.phases.length ?? 0,
      actorCount: window.replayLabApp?.facade.snapshot.actors.length ?? 0,
      actionCount: window.replayLabApp?.facade.snapshot.actions.length ?? 0,
      maximumPathPoints: Math.max(0, ...window.replayLabApp!.facade.snapshot.actions.map(action => action.path.value.points.length)),
    };
  }, { warmupMs: 5_000, traceMs: 30_000, mode: presentation });

  if (presentation === 'plan') {
    await page.mouse.move(
      bounds.x + (180 / 840) * bounds.width,
      bounds.y + (170 / 460) * bounds.height
    );
    await page.mouse.up();
  }

  const framesPerSecond = (trace.frames * 1000) / trace.elapsedMs;
  const frameIntervalP95Ms = percentile(trace.frameIntervalsMs, 0.95);
  const inputToPaintP95Ms = percentile(trace.inputToPaintMs, 0.95);
  const heapDeltaBytes = trace.heapBeforeBytes === null || trace.heapAfterBytes === null ? null : trace.heapAfterBytes - trace.heapBeforeBytes;
  const report = {
    generatedAt: new Date().toISOString(),
    verdict:
      framesPerSecond >= 55 &&
      inputToPaintP95Ms < 50 &&
      trace.localOpenMs < 1_500 &&
      trace.reactRenderCountBefore === trace.reactRenderCountAfter &&
      trace.phaseCount === 12 &&
      trace.actorCount === 10 &&
      trace.actionCount === 30 &&
      trace.presentation === presentation &&
      (heapDeltaBytes === null || heapDeltaBytes < 64 * 1024 * 1024)
        ? 'PASS'
        : 'FAIL',
    profile: {
      id: 'replaylab-render-v1',
      presentation,
      interaction: presentation === 'plan' ? 'pointer drag' : 'playback scrubbing with all paths visible',
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
      maximumPathPoints: trace.maximumPathPoints,
      note: `${presentation === 'plan' ? 'Slice 2A plan' : 'Watch 3D'} maximum path projection fixture for one visible transition.`,
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
        presentation === 'plan' ? trace.reactRenderCountAfter - trace.reactRenderCountBefore : null,
      reactRendersDuringPlayback:
        presentation === '3d' ? trace.reactRenderCountAfter - trace.reactRenderCountBefore : null,
      heapBeforeBytes: trace.heapBeforeBytes,
      heapAfterBytes: trace.heapAfterBytes,
      heapDeltaBytes,
    },
    budgets: {
      minimumFramesPerSecond: 55,
      maximumInputToPaintP95Ms: 50,
      maximumLocalOpenMs: 1_500,
      maximumReactRendersDuringPointerMoves: 0,
      maximumReactRendersDuringPlayback: 0,
      maximumHeapGrowthBytes: 64 * 1024 * 1024,
    },
    userAgent: trace.userAgent,
  };

  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    resolve(evidenceRoot, presentation === 'plan' ? 'slice2a-performance.json' : 'coach-3d-performance.json'),
    JSON.stringify(report, null, 2) + String.fromCharCode(10)
  );

  expect(trace.phaseCount).toBe(12);
  expect(trace.actorCount).toBe(10);
  expect(framesPerSecond).toBeGreaterThanOrEqual(55);
  expect(inputToPaintP95Ms).toBeLessThan(50);
  expect(trace.localOpenMs).toBeLessThan(1_500);
  expect(trace.actionCount).toBe(30);
  expect(trace.maximumPathPoints).toBe(presentation === '3d' ? 64 : 2);
  expect(trace.presentation).toBe(presentation);
  if (heapDeltaBytes !== null) expect(heapDeltaBytes).toBeLessThan(64 * 1024 * 1024);
  expect(trace.reactRenderCountAfter).toBe(trace.reactRenderCountBefore);
  expect(trace.gfxRenderCountAfter).toBeGreaterThan(trace.gfxRenderCountBefore);
});
}
