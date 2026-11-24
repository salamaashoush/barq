import { CANVAS_SEARCH_TAB, DEFAULT_SIDEBAR, KEYS } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import type { Action } from "../types.ts";

/** The input the search menu draws, which the action focuses when the menu is open already. */
export const SEARCH_MENU_INPUT_ATTRIBUTE = "data-search-menu-input";

/** Opens the sidebar on the search, or focuses its input when it is open. Ctrl+F. */
export const actionToggleSearchMenu: Action = {
  name: "searchMenu",
  label: "search.title",
  keywords: ["search", "find"],
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, _formData, editor) => {
    if (appState.openDialog) {
      return false;
    }
    if (
      appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
      appState.openSidebar.tab === CANVAS_SEARCH_TAB
    ) {
      const input = editor.container.querySelector<HTMLInputElement>(
        `[${SEARCH_MENU_INPUT_ATTRIBUTE}]`,
      );
      input?.focus();
      input?.select();
      return false;
    }
    return {
      appState: {
        ...appState,
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB },
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && !event.shiftKey && event.key === KEYS.F,
};
