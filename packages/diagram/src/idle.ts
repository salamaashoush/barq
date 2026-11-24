import { ACTIVE_THRESHOLD, IDLE_THRESHOLD, UserIdleState } from "@excalidraw/common";

export interface IdleDetectorOptions {
  /** The window whose document is watched. @default window */
  ownerWindow?: Window & typeof globalThis;
  /** Called with the user's state, to broadcast it. */
  onChange: (state: UserIdleState) => void;
}

/**
 * The user's idle state, as Excalidraw's app reports it to a room: active
 * every `ACTIVE_THRESHOLD` while the pointer moves, idle once it has not for
 * `IDLE_THRESHOLD`, away while the page is hidden and active again when it
 * shows. Returns the stop.
 */
export function createIdleDetector({
  ownerWindow = window,
  onChange,
}: IdleDetectorOptions): () => void {
  const document = ownerWindow.document;
  let idleTimeoutId: number | null = null;
  let activeIntervalId: number | null = null;

  function clearTimers(): void {
    if (idleTimeoutId !== null) {
      ownerWindow.clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
    if (activeIntervalId !== null) {
      ownerWindow.clearInterval(activeIntervalId);
      activeIntervalId = null;
    }
  }

  function reportActive(): void {
    return onChange(UserIdleState.ACTIVE);
  }

  function reportIdle(): void {
    onChange(UserIdleState.IDLE);
    if (activeIntervalId !== null) {
      ownerWindow.clearInterval(activeIntervalId);
      activeIntervalId = null;
    }
  }

  function onPointerMove(): void {
    if (idleTimeoutId !== null) {
      ownerWindow.clearTimeout(idleTimeoutId);
    }
    idleTimeoutId = ownerWindow.setTimeout(reportIdle, IDLE_THRESHOLD);
    if (activeIntervalId === null) {
      activeIntervalId = ownerWindow.setInterval(reportActive, ACTIVE_THRESHOLD);
    }
  }

  function onVisibilityChange(): void {
    clearTimers();
    if (document.hidden) {
      onChange(UserIdleState.AWAY);
    } else {
      idleTimeoutId = ownerWindow.setTimeout(reportIdle, IDLE_THRESHOLD);
      activeIntervalId = ownerWindow.setInterval(reportActive, ACTIVE_THRESHOLD);
      onChange(UserIdleState.ACTIVE);
    }
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearTimers();
  };
}
