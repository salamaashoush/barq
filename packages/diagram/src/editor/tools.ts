import { KEYS } from "@excalidraw/common";

import type { AppState, ToolType } from "../types.ts";

interface ToolConfig {
  /** Letter shortcuts, the first the one to show. */
  letterKey?: string | readonly string[];
  /** Whether `letterKey` needs Shift held. */
  shiftKey?: boolean;
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
  stickynote: { letterKey: KEYS.N },
  image: { numericKey: KEYS["9"] },
  eraser: { letterKey: KEYS.E, numericKey: KEYS["0"], toggle: true },
  frame: { letterKey: KEYS.F },
  embeddable: {},
  magicframe: {},
  laser: { letterKey: KEYS.K },
  autoshape: { letterKey: KEYS.X, shiftKey: true },
  bucketfill: { letterKey: KEYS.B },
  lasso: {},
} satisfies Partial<Record<ToolType, ToolConfig>>;

export type EditorToolType = keyof typeof TOOLS;

/** The tools that switch back to the previous tool when activated again. */
export const TOGGLE_TOOLS: readonly (ToolType | "custom")[] = (
  Object.keys(TOOLS) as EditorToolType[]
).filter((type) => (TOOLS[type] as ToolConfig).toggle === true);

export function isEditorTool(type: string): type is EditorToolType {
  return Object.hasOwn(TOOLS, type);
}

/** The tool a key (without modifiers but shift) activates, or `null`. */
export function findToolByKey(
  key: string,
  state: Pick<AppState, "preferredSelectionTool">,
  shiftKey = false,
): EditorToolType | null {
  // a capital letter without shift is CapsLock
  const lowerKey = key.toLowerCase();
  for (const type of Object.keys(TOOLS) as EditorToolType[]) {
    const { letterKey, numericKey, shiftKey: requiresShift } = TOOLS[type] as ToolConfig;
    // shift-bound tools need shift, the others its absence
    if (shiftKey !== Boolean(requiresShift)) {
      continue;
    }
    if (
      (numericKey !== undefined && key === numericKey) ||
      (letterKey !== undefined &&
        (typeof letterKey === "string" ? letterKey === lowerKey : letterKey.includes(lowerKey)))
    ) {
      // the selection key picks the preferred selection tool, lasso or not
      return type === "selection" ? state.preferredSelectionTool.type : type;
    }
  }
  return null;
}
