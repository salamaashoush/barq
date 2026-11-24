import type { Demos } from "../../gallery/types.ts";
import ActionBars from "./action-bar.tsx";
import actionBar from "./action-bar.tsx?raw";
import Buttons from "./buttons.tsx";
import buttons from "./buttons.tsx?raw";
import CopyButtons from "./copy-button.tsx";
import copyButton from "./copy-button.tsx?raw";
import IconButtons from "./icon-buttons.tsx";
import iconButtons from "./icon-buttons.tsx?raw";
import Menus from "./menus.tsx";
import menus from "./menus.tsx?raw";
import SelectionBars from "./selection-bar.tsx";
import selectionBar from "./selection-bar.tsx?raw";
import SplitButtons from "./split-button.tsx";
import splitButton from "./split-button.tsx?raw";
import Toggles from "./toggles.tsx";
import toggles from "./toggles.tsx?raw";
import Toolbars from "./toolbar.tsx";
import toolbar from "./toolbar.tsx?raw";

export const demos: Demos = {
  buttons: { component: Buttons, code: buttons },
  "icon-buttons": { component: IconButtons, code: iconButtons },
  "split-button": { component: SplitButtons, code: splitButton },
  toolbar: { component: Toolbars, code: toolbar },
  "action-bar": { component: ActionBars, code: actionBar },
  "selection-bar": { component: SelectionBars, code: selectionBar },
  "copy-button": { component: CopyButtons, code: copyButton },
  toggles: { component: Toggles, code: toggles },
  menus: { component: Menus, code: menus },
};
