import type { Demos } from "../../gallery/types.ts";
import ActionFeedback from "./action-feedback.tsx";
import actionFeedback from "./action-feedback.tsx?raw";
import Confirmations from "./confirmations.tsx";
import confirmations from "./confirmations.tsx?raw";
import EmptyStates from "./empty-states.tsx";
import emptyStates from "./empty-states.tsx?raw";
import Lifecycle from "./lifecycle.tsx";
import lifecycle from "./lifecycle.tsx?raw";
import LinkedDialogs from "./linked-dialogs.tsx";
import linkedDialogs from "./linked-dialogs.tsx?raw";
import Modals from "./modals.tsx";
import modals from "./modals.tsx?raw";
import Skeletons from "./skeletons.tsx";
import skeletons from "./skeletons.tsx?raw";
import StatusPages from "./status-pages.tsx";
import statusPages from "./status-pages.tsx?raw";
import Success from "./success.tsx";
import success from "./success.tsx?raw";
import Timers from "./timers.tsx";
import timers from "./timers.tsx?raw";
import Values from "./values.tsx";
import values from "./values.tsx?raw";

export const demos: Demos = {
  confirmations: { component: Confirmations, code: confirmations },
  modals: { component: Modals, code: modals },
  "linked-dialogs": { component: LinkedDialogs, code: linkedDialogs },
  "action-feedback": { component: ActionFeedback, code: actionFeedback },
  "empty-states": { component: EmptyStates, code: emptyStates },
  success: { component: Success, code: success },
  "status-pages": { component: StatusPages, code: statusPages },
  skeletons: { component: Skeletons, code: skeletons },
  values: { component: Values, code: values },
  timers: { component: Timers, code: timers },
  lifecycle: { component: Lifecycle, code: lifecycle },
};
