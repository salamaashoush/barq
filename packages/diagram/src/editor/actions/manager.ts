import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionName, ActionResult } from "../types.ts";

/**
 * Runs actions: by keyboard shortcut, when exactly one action's `keyTest`
 * matches, or by name. What an action returns goes to `updater`, the
 * editor's `syncActionResult`. Excalidraw's `ActionManager`, without panels.
 */
export class ActionManager {
  public readonly actions = new Map<ActionName, Action>();

  public constructor(
    private readonly updater: (result: ActionResult, action: Action) => void,
    private readonly getAppState: () => AppState,
    private readonly getElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[],
    private readonly editor: DiagramEditor,
  ) {}

  public registerAction(action: Action): void {
    this.actions.set(action.name, action);
  }

  public registerAll(actions: readonly Action[]): void {
    for (const action of actions) this.registerAction(action);
  }

  /** Runs the action whose shortcut the key is; whether one ran. */
  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.editor.isInteractionEnabled() && !this.editor.isNavigationEnabled()) {
      return false;
    }
    const appState = this.getAppState();
    const elements: readonly ExcalidrawElement[] = this.getElementsIncludingDeleted();
    // a canvas action the host turned off has no shortcut either
    const canvasActions: Record<string, unknown> = this.editor.host.UIOptions.canvasActions;
    const matches = [...this.actions.values()]
      .toSorted((a, b) => (b.keyPriority ?? 0) - (a.keyPriority ?? 0))
      .filter(
        (action) =>
          (!(action.name in canvasActions) || canvasActions[action.name] !== false) &&
          action.keyTest?.(event, appState, elements, this.editor) === true,
      );

    if (matches.length !== 1) {
      if (matches.length > 1) {
        console.warn("DiagramEditor: more than one action matches this shortcut", matches);
      }
      return false;
    }
    const [action] = matches;
    if (action === undefined) return false;
    // a non-interactive editor runs only navigation, when navigation is on
    if (!this.editor.isInteractionEnabled() && action.navigation !== true) return false;
    if (appState.viewModeEnabled && action.viewMode !== true) return false;

    event.preventDefault();
    event.stopPropagation();
    if (this.isBlockedByViewportTransition(action)) return true;
    this.run(action, null);
    return true;
  }

  /**
   * Runs an action. From the UI (`source` other than `"api"`), a
   * non-interactive editor runs only navigation, when navigation is on.
   */
  public executeAction<T>(
    action: Action<T>,
    value: T | null = null,
    source: "api" | "ui" = "api",
  ): void {
    if (
      source !== "api" &&
      !this.editor.isInteractionEnabled() &&
      !(this.editor.isNavigationEnabled() && action.navigation === true)
    ) {
      return;
    }
    if (this.isBlockedByViewportTransition(action as Action)) {
      return;
    }
    this.run(action, value);
  }

  private isBlockedByViewportTransition(action: Action): boolean {
    return action.navigation === true && this.editor.viewport.isLockedTransitionPending;
  }

  public isActionEnabled(action: Action): boolean {
    return (
      action.predicate === undefined ||
      action.predicate(this.getElementsIncludingDeleted(), this.getAppState(), this.editor)
    );
  }

  private run<T>(action: Action<T>, value: T | null): void {
    const result = action.perform(
      this.getElementsIncludingDeleted(),
      this.getAppState(),
      value,
      this.editor,
    );
    if (result instanceof Promise) {
      // a clipboard action resolves later, outside the event that ran it
      void result.then(
        (resolved) => this.editor.batch(() => this.updater(resolved, action as Action)),
        (error: unknown) =>
          console.error(`DiagramEditor: the "${action.name}" action failed`, error),
      );
      return;
    }
    this.updater(result, action as Action);
  }
}
