import { KEYS } from "@excalidraw/common";

import type { AppState, ToolType } from "../types.ts";

interface ToolConfig {
  /** Letter shortcuts, the first the one to show. */
  letterKey?: string | readonly string[];
  numericKey?: string;
  /** Activating the tool again switches back to the tool before it. */
  toggle?: boolean;
}

/** The editor's tools and their shortcuts, as in Excalidraw's toolbar. */
export const TOOLS = {
  hand: { letterKey: KEYS.H, toggle: true },
  selection: { letterKey: KEYS.V, numericKey: KEYS["1"] },
  rectangle: { letterKey: KEYS.R, numericKey: KEYS["2"] },
  diamond: { letterKey: KEYS.D, numericKey: KEYS["3"] },
  ellipse: { letterKey: KEYS.O, numericKey: KEYS["4"] },
  arrow: { letterKey: KEYS.A, numericKey: KEYS["5"] },
  line: { letterKey: KEYS.L, numericKey: KEYS["6"] },
  freedraw: { letterKey: [KEYS.P, KEYS.X], numericKey: KEYS["7"] },
  text: { letterKey: KEYS.T, numericKey: KEYS["8"] },
} satisfies Partial<Record<ToolType, ToolConfig>>;

export type EditorToolType = keyof typeof TOOLS;

/** The tools that switch back to the previous tool when activated again. */
export const TOGGLE_TOOLS: readonly (ToolType | "custom")[] = (
  Object.keys(TOOLS) as EditorToolType[]
).filter((type) => (TOOLS[type] as ToolConfig).toggle === true);

export const isEditorTool = (type: string): type is EditorToolType => Object.hasOwn(TOOLS, type);

/** The tool a key (without modifiers but shift) activates, or `null`. */
export const findToolByKey = (
  key: string,
  state: Pick<AppState, "preferredSelectionTool">,
  shiftKey = false,
): EditorToolType | "lasso" | null => {
  if (shiftKey) {
    return null;
  }
  // a capital letter without shift is CapsLock
  const lowerKey = key.toLowerCase();
  for (const type of Object.keys(TOOLS) as EditorToolType[]) {
    const { letterKey, numericKey } = TOOLS[type] as ToolConfig;
    if (
      (numericKey !== undefined && key === numericKey) ||
      (letterKey !== undefined &&
        (typeof letterKey === "string" ? letterKey === lowerKey : letterKey.includes(lowerKey)))
    ) {
      return type === "selection" ? state.preferredSelectionTool.type : type;
    }
  }
  return null;
};
