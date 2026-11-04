import { expect, test, type ElementHandle, type Page } from '@playwright/test';
import type { GameState } from '../src/model';

type Preset = 'auto' | 'low' | 'medium' | 'high';
interface GraphicsSnapshot {
  requested: Preset;
  resolved: Exclude<Preset, 'auto'>;
  pixelRatio: number;
  viewDistance: number;
  shadows: boolean;
  headlightBudget: number;
}
interface Snapshot {
  state: Pick<GameState, 'player' | 'money' | 'time'>;
  started: boolean;
  paused: boolean;
  rendering: { frames: number; software: boolean; graphics: GraphicsSnapshot };
}
interface Probe extends Snapshot {
  canvas: {
    width: number; height: number; cssWidth: number; cssHeight: number;
    count: number; retained: boolean;
  };
  ui: {
    preset: string; options: string[]; graphicsOpen: boolean; introVisible: boolean; resumeVisible: boolean;
    dialogInViewport: boolean; presetInViewport: boolean; closeInViewport: boolean;
    documentFits: boolean; dialogFits: boolean;
  };
}
type CanvasHandle = ElementHandle<SVGElement | HTMLElement>;
const probe = (page: Page, retainedCanvas: CanvasHandle | null = null): Promise<Probe> => page.evaluate(retained => {
  const value = (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__;
  const canvas = document.querySelector<HTMLCanvasElement>('#world canvas')!;
  const bounds = canvas.getBoundingClientRect();
  const dialog = document.querySelector<HTMLElement>('#graphics-dialog');
  const preset = document.querySelector<HTMLSelectElement>('#graphics-preset');
  const visible = (element: Element | null) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const inViewport = (element: Element | null, full: boolean) => {
    if (!visible(element)) return false;
    const rect = element!.getBoundingClientRect();
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let parent = element!.parentElement; parent; parent = parent.parentElement) {
      // Root overflow propagates to the viewport; an all-positioned page can
      // have a zero-height body without clipping its fixed/absolute dialogs.
      if(parent===document.body||parent===document.documentElement)continue;
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom);
      }
    }
    return full ? rect.left >= clip.left && rect.top >= clip.top && rect.right <= clip.right && rect.bottom <= clip.bottom
      : rect.right > clip.left && rect.bottom > clip.top && rect.left < clip.right && rect.top < clip.bottom;
  };
  return {
    state: { player: value.state.player, money: value.state.money, time: value.state.time },
    started: value.started, paused: value.paused, rendering: value.rendering,
    canvas: {
      width: canvas.width, height: canvas.height, cssWidth: bounds.width, cssHeight: bounds.height,
      count: document.querySelectorAll('#world canvas').length,
      retained: retained === null || retained.isConnected && retained === canvas,
    },
    ui: {
      preset: preset?.value ?? '', options: preset ? [...preset.options].map(option => option.value) : [],
      graphicsOpen: dialog !== null, introVisible: visible(document.querySelector('#start-game')),
      resumeVisible: visible(document.querySelector('#resume')),
      dialogInViewport: inViewport(dialog, false), presetInViewport: inViewport(preset, true),
      closeInViewport: inViewport(document.querySelector('#graphics-close'), true),
      documentFits: document.documentElement.scrollWidth <= innerWidth,
      dialogFits: dialog === null || dialog.scrollWidth <= dialog.clientWidth,
    },
  };
}, retainedCanvas);
const moved = (from: GameState['player'], to: GameState['player']) => Math.hypot(from.x - to.x, from.z - to.z);

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webgl|framebuffer/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function choosePreset(page: Page, preset: Preset, beforeFrames: number, retainedCanvas: CanvasHandle | null = null) {
  await page.locator('#graphics-preset').selectOption(preset);
  let selected!: Probe;
  await expect.poll(async () => {
    selected = await probe(page, retainedCanvas);
    return selected.rendering.frames;
  }).toBeGreaterThan(beforeFrames);
  expect(selected.ui.preset).toBe(preset);
  expect(selected.rendering.graphics.requested).toBe(preset);
  return selected;
}

function expectDrawingBufferMatchesPreset(stage: Probe) {
  const { canvas } = stage, graphics = stage.rendering.graphics;
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
  expect(Math.abs(canvas.width / canvas.cssWidth - graphics.pixelRatio)).toBeLessThanOrEqual(1 / canvas.cssWidth + .002);
  expect(Math.abs(canvas.height / canvas.cssHeight - graphics.pixelRatio)).toBeLessThanOrEqual(1 / canvas.cssHeight + .002);
  return canvas;
}

test('wybór grafiki działa na żywym obrazie, zachowuje grę i pozostaje po odświeżeniu', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors = watch(page);
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#intro-graphics').click();
  await expect(page.locator('#graphics-dialog')).toBeVisible();
  const retainedCanvas = await page.locator('#world canvas').elementHandle();
  expect(retainedCanvas).not.toBeNull();
  const before = await probe(page, retainedCanvas);
  expect(before.ui.options).toEqual(['auto', 'low', 'medium', 'high']);
  const lowStage = await choosePreset(page, 'low', before.rendering.frames, retainedCanvas);
  const lowBuffer = expectDrawingBufferMatchesPreset(lowStage), low = lowStage.rendering.graphics;
  const highStage = await choosePreset(page, 'high', lowStage.rendering.frames, retainedCanvas);
  const highBuffer = expectDrawingBufferMatchesPreset(highStage), high = highStage.rendering.graphics;
  expect(highStage.started).toBe(false);
  expect(highStage.state.player).toEqual(before.state.player);
  expect(highStage.state.money).toBe(before.state.money);
  expect(highStage.state.time).toBe(before.state.time);
  expect(high.pixelRatio).toBeGreaterThanOrEqual(low.pixelRatio);
  expect(high.viewDistance).toBeGreaterThanOrEqual(low.viewDistance);
  expect(high.headlightBudget).toBeGreaterThanOrEqual(low.headlightBudget);
  expect(low.resolved).toBe('low');
  expect(high.resolved).toBe('high');
  if (highStage.rendering.software) {
    expect(low.pixelRatio).toBeLessThanOrEqual(.55);
    expect(high.pixelRatio).toBeLessThanOrEqual(.85);
    expect(lowBuffer.width * lowBuffer.height).toBeLessThanOrEqual(450000);
    expect(highBuffer.width * highBuffer.height).toBeLessThanOrEqual(900000);
    expect(low.viewDistance).toBe(170);
    expect(high.viewDistance).toBe(245);
    expect(high.shadows).toBe(false);
    expect(high.headlightBudget).toBe(0);
  }
  expect(highStage.canvas.retained).toBe(true);
  expect(highStage.canvas.count).toBe(1);
  await retainedCanvas!.dispose();
  await page.screenshot({ path: info.outputPath('graphics-presets-desktop.png'), fullPage: true });
  await info.attach('graphics-preset-profiles', { body: JSON.stringify({ low, high, software: highStage.rendering.software }, null, 2), contentType: 'application/json' });
  await page.locator('#graphics-close').click();
  const closed = await probe(page);
  expect(closed.ui.graphicsOpen).toBe(false);
  expect(closed.ui.introVisible).toBe(true);
  expect(closed.started).toBe(false);
  await page.reload();
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#intro-graphics').click();
  const restored = await probe(page);
  expect(restored.ui.preset).toBe('high');
  expect(restored.rendering.graphics.requested).toBe('high');
  expectDrawingBufferMatchesPreset(restored);
  expect(errors).toEqual([]);
});

test('ustawienia z pauzy mieszczą się na telefonie i oddają sterowanie po zamknięciu', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors = watch(page);
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await page.locator('#pause').click();
  await page.locator('#pause-graphics').click();
  await expect(page.locator('#graphics-dialog')).toBeVisible();
  const paused = await probe(page);
  expect(paused.paused).toBe(true);
  const low = await choosePreset(page, 'low', paused.rendering.frames);
  await page.keyboard.press('Tab');
  let stillPaused!: Probe;
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      stillPaused = await probe(page);
      return stillPaused.rendering.frames;
    }).toBeGreaterThan(low.rendering.frames + 3);
  } finally { await page.keyboard.up('w'); }
  expect(stillPaused.state.player).toEqual(paused.state.player);
  expect(stillPaused.state.money).toBe(paused.state.money);
  expect(stillPaused.state.time).toBe(paused.state.time);
  await page.keyboard.press('Escape');
  const escaped = await probe(page);
  expect(escaped.ui.graphicsOpen).toBe(false);
  expect(escaped.ui.resumeVisible).toBe(true);
  expect(escaped.paused).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pause-graphics').click();
  await expect(page.locator('#graphics-dialog')).toBeInViewport();
  await expect(page.locator('#graphics-preset')).toBeInViewport({ratio:1});
  await expect(page.locator('#graphics-close')).toBeInViewport({ratio:1});
  const mobile = await probe(page);
  expect(mobile.ui.dialogInViewport).toBe(true);
  expect(mobile.ui.presetInViewport).toBe(true);
  expect(mobile.ui.closeInViewport).toBe(true);
  expect(mobile.ui.documentFits).toBe(true);
  expect(mobile.ui.dialogFits).toBe(true);
  const focused: string[] = [];
  let beforeMediumFrames = mobile.rendering.frames;
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      id: document.activeElement?.id ?? '',
      inside: document.querySelector('#graphics-dialog')!.contains(document.activeElement),
      frames: (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__.rendering.frames,
    }));
    focused.push(focus.id);
    beforeMediumFrames = focus.frames;
    expect(focus.inside).toBe(true);
  }
  expect(focused).toContain('graphics-preset');
  const medium = await choosePreset(page, 'medium', beforeMediumFrames);
  expectDrawingBufferMatchesPreset(medium);
  await page.screenshot({ path: info.outputPath('graphics-settings-mobile.png'), fullPage: true });
  await page.locator('#graphics-close').click();
  const closed = await probe(page);
  expect(closed.ui.resumeVisible).toBe(true);
  expect(closed.paused).toBe(true);
  const beforeResume = closed.state;
  await page.locator('#resume').click();
  expect((await probe(page)).paused).toBe(false);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => moved(beforeResume.player, (await probe(page)).state.player)).toBeGreaterThan(.6);
  } finally { await page.keyboard.up('w'); }
  expect((await probe(page)).state.money).toBe(beforeResume.money);
  expect(errors).toEqual([]);
});
