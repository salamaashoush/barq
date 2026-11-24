import type { Demos } from "../../gallery/types.ts";
import Alerts from "./alerts.tsx";
import alerts from "./alerts.tsx?raw";
import Dialogs from "./dialogs.tsx";
import dialogs from "./dialogs.tsx?raw";
import Popovers from "./popovers.tsx";
import popovers from "./popovers.tsx?raw";
import ResponsiveOverlays from "./responsive.tsx";
import responsive from "./responsive.tsx?raw";
import Sheets from "./sheets.tsx";
import sheets from "./sheets.tsx?raw";
import Toasts from "./toasts.tsx";
import toasts from "./toasts.tsx?raw";
import Tours from "./tour.tsx";
import tour from "./tour.tsx?raw";

export const demos: Demos = {
  dialogs: { component: Dialogs, code: dialogs },
  sheets: { component: Sheets, code: sheets },
  responsive: { component: ResponsiveOverlays, code: responsive },
  popovers: { component: Popovers, code: popovers },
  alerts: { component: Alerts, code: alerts },
  toasts: { component: Toasts, code: toasts },
  tour: { component: Tours, code: tour },
};
