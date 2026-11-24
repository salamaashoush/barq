import { CODES, KEYS, THEME, matchKey } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { getConversionTypeFromElements } from "../convert.ts";

import type { Theme } from "@excalidraw/element/types";

import type { Action } from "../types.ts";

/** Below this height the minimap would crowd the panels, and is not offered. */
export const MINIMAP_MIN_EDITOR_HEIGHT = 500;

/** Arrows bind to the shapes they end on, or not; Ctrl or Cmd inverts it while held. */
export const actionToggleArrowBinding: Action = {
  name: "arrowBinding",
  label: "labels.arrowBinding",
  announcement: "Arrow binding toggled",
  perform: (_elements, appState) => {
    const bindingPreference = appState.bindingPreference === "enabled" ? "disabled" : "enabled";
    return {
      appState: {
        ...appState,
        bindingPreference,
        isBindingEnabled: bindingPreference === "enabled",
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  checked: (appState) => appState.bindingPreference === "enabled",
};

/** Arrows snap to the midpoints of the shapes' sides. */
export const actionToggleMidpointSnapping: Action = {
  name: "midpointSnapping",
  label: "labels.midpointSnapping",
  announcement: "Midpoint snapping toggled",
  perform: (_elements, appState) => ({
    appState: { ...appState, isMidpointSnappingEnabled: !appState.isMidpointSnappingEnabled },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
  checked: (appState) => appState.isMidpointSnappingEnabled,
};

/** Hides the panels, leaving the canvas and the toolbar. Alt+Z. */
export const actionToggleZenMode: Action = {
  name: "zenMode",
  label: "buttons.zenMode",
  announcement: "Zen mode toggled",
  viewMode: true,
  perform: (_elements, appState) => ({
    appState: { ...appState, zenModeEnabled: !appState.zenModeEnabled },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
  checked: (appState) => appState.zenModeEnabled,
  predicate: (_elements, _appState, editor) => !editor.host.zenModeControlled,
  keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && matchKey(event, KEYS.Z),
};

/** Read only: the scene pans and zooms, nothing is edited. Alt+R. */
export const actionToggleViewMode: Action = {
  name: "viewMode",
  label: "labels.viewMode",
  announcement: "View mode toggled",
  viewMode: true,
  perform: (_elements, appState) => ({
    appState: { ...appState, viewModeEnabled: !appState.viewModeEnabled },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
  checked: (appState) => appState.viewModeEnabled,
  predicate: (_elements, _appState, editor) => !editor.host.viewModeControlled,
  keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.R,
};

/** The stats panel, where the selection's position, size and angle are typed. Alt+/. */
export const actionToggleStats: Action = {
  name: "stats",
  label: "stats.fullTitle",
  keywords: ["edit", "attributes", "customize"],
  announcement: "Stats toggled",
  viewMode: true,
  perform: (_elements, appState) => ({
    appState: { ...appState, stats: { ...appState.stats, open: !appState.stats.open } },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
  checked: (appState) => appState.stats.open,
  keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.SLASH,
};

/** The overview of the whole scene beside the zoom controls. */
export const actionToggleMinimap: Action = {
  name: "minimap",
  label: "labels.minimap",
  keywords: ["map", "overview", "navigator", "navigation"],
  announcement: "Minimap toggled",
  viewMode: true,
  navigation: true,
  perform: (_elements, appState) => ({
    appState: { ...appState, minimapEnabled: !appState.minimapEnabled },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
  checked: (appState) => appState.minimapEnabled,
  predicate: (_elements, appState, app) =>
    app.isUIControlEnabled("minimap") &&
    appState.height >= MINIMAP_MIN_EDITOR_HEIGHT &&
    app.isNavigationEnabled(),
};

/** The hint under the toolbar, which says what the tool or the selection does. */
export const actionToggleShowHints: Action = {
  name: "showHints",
  label: "labels.showHints",
  keywords: ["hint", "hints", "tip", "tips"],
  announcement: "Hints toggled",
  perform: (_elements, appState) => ({
    appState: { ...appState, showHints: !appState.showHints },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
  checked: (appState) => appState.showHints,
};

/** Light or dark, or the theme asked for; the host's `onThemeChange` when it owns the theme. Alt+Shift+D. */
export const actionToggleTheme: Action<Theme> = {
  name: "toggleTheme",
  label: (_elements, appState) =>
    appState.theme === THEME.DARK ? "buttons.lightMode" : "buttons.darkMode",
  keywords: ["toggle", "dark", "light", "mode", "theme"],
  announcement: "Theme changed",
  viewMode: true,
  perform: (_elements, appState, value, editor) => {
    const theme = value ?? (appState.theme === THEME.LIGHT ? THEME.DARK : THEME.LIGHT);
    if (editor.host.onThemeChange) {
      editor.host.onThemeChange(theme);
      return false;
    }
    return { appState: { ...appState, theme }, captureUpdate: CaptureUpdateAction.EVENTUALLY };
  },
  checked: (appState) => appState.theme === THEME.DARK,
  predicate: (_elements, _appState, editor) => editor.host.UIOptions.canvasActions.toggleTheme,
  keyTest: (event) =>
    !event[KEYS.CTRL_OR_CMD] && event.altKey && event.shiftKey && event.code === CODES.D,
};

/** Opens the shape switch's panel for the selection, which Alt+Shift+. and , step through. */
export const actionToggleShapeSwitch: Action = {
  name: "toggleShapeSwitch",
  label: "labels.shapeSwitch",
  keywords: ["change", "switch", "swap"],
  announcement: "",
  viewMode: true,
  perform: (_elements, appState) => ({
    appState: { ...appState, openPopup: "convertElementType" },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
  predicate: (_elements, appState, editor) =>
    getConversionTypeFromElements(editor.scene.getSelectedElements(appState)) !== null,
};

/** The help dialog with every shortcut. `?`. */
export const actionShortcuts: Action = {
  name: "toggleShortcuts",
  label: "welcomeScreen.defaults.helpHint",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, _formData, editor) => {
    if (appState.openDialog?.name === "help") {
      editor.focusContainer();
    }
    return {
      appState: {
        ...appState,
        openDialog: appState.openDialog?.name === "help" ? null : { name: "help" },
        openMenu: null,
        openPopup: null,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) => event.key === KEYS.QUESTION_MARK,
};

/** The command palette, every action found by typing. Ctrl+/ or Ctrl+Shift+P. */
export const actionToggleCommandPalette: Action = {
  name: "commandPalette",
  label: "commandPalette.title",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState) => ({
    appState: {
      ...appState,
      openDialog:
        appState.openDialog?.name === "commandPalette" ? null : { name: "commandPalette" },
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
  keyTest: (event) =>
    !event.altKey &&
    event[KEYS.CTRL_OR_CMD] &&
    ((event.shiftKey && event.key.toLowerCase() === KEYS.P) || event.key === KEYS.SLASH),
};
