/**
 * Excalidraw's `AnimationController`: animations keyed by a string (shared
 * across editors) or a symbol (one editor's own), stepped once per frame of
 * the window that scheduled them until they return nothing.
 */

export type AnimationKey = string | symbol;

export type Animation<R extends object> = (params: {
  deltaTime: number;
  state?: R;
}) => R | null | undefined;

export type AnimationScheduler = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame">;

type AnimationRecord = {
  animation: Animation<object>;
  lastTime: number;
  state: object | undefined;
  scheduler: AnimationScheduler;
};

const scheduledFrames = new Map<AnimationScheduler, number>();
const animations = new Map<AnimationKey, AnimationRecord>();

const cancelScheduledFrameIfIdle = (scheduler: AnimationScheduler): boolean => {
  for (const record of animations.values()) {
    if (record.scheduler === scheduler) {
      return false;
    }
  }
  const frame = scheduledFrames.get(scheduler);
  if (frame !== undefined) {
    scheduler.cancelAnimationFrame(frame);
    scheduledFrames.delete(scheduler);
  }
  return true;
};

const scheduleNextFrame = (scheduler: AnimationScheduler): void => {
  if (scheduledFrames.has(scheduler)) {
    return;
  }
  scheduledFrames.set(
    scheduler,
    scheduler.requestAnimationFrame(() => tick(scheduler)),
  );
};

const tick = (scheduler: AnimationScheduler): void => {
  scheduledFrames.delete(scheduler);
  // what a step starts runs from the next frame on, and each runs once a frame
  const records = [...animations].filter(([, record]) => record.scheduler === scheduler);
  for (const [key, record] of records) {
    if (animations.get(key) !== record) {
      continue;
    }
    const now = performance.now();
    const deltaTime = record.lastTime === 0 ? 0 : now - record.lastTime;
    const state = record.animation({ deltaTime, state: record.state });
    if (animations.get(key) !== record) {
      continue;
    }
    if (!state) {
      animations.delete(key);
    } else {
      record.lastTime = now;
      record.state = state;
    }
  }
  if (!cancelScheduledFrameIfIdle(scheduler)) {
    scheduleNextFrame(scheduler);
  }
};

export const startAnimation = <R extends object>(
  key: AnimationKey,
  animation: Animation<R>,
  scheduler: AnimationScheduler,
): void => {
  if (animations.has(key)) {
    return;
  }
  const record: AnimationRecord = {
    animation: animation as unknown as Animation<object>,
    lastTime: 0,
    state: undefined,
    scheduler,
  };
  animations.set(key, record);

  let initialState: R | null | undefined;
  try {
    initialState = animation({ deltaTime: 0, state: undefined });
  } catch (error) {
    if (animations.get(key) === record) {
      animations.delete(key);
      cancelScheduledFrameIfIdle(scheduler);
    }
    throw error;
  }

  // the first step may have cancelled the animation or replaced it under
  // the same key: never bring it back
  if (animations.get(key) !== record) {
    return;
  }
  if (!initialState) {
    animations.delete(key);
    cancelScheduledFrameIfIdle(scheduler);
    return;
  }
  record.state = initialState;
  scheduleNextFrame(scheduler);
};

export const isAnimationRunning = (key: AnimationKey): boolean => animations.has(key);

export const cancelAnimation = (key: AnimationKey): void => {
  const record = animations.get(key);
  animations.delete(key);
  if (record) {
    cancelScheduledFrameIfIdle(record.scheduler);
  }
};
