import type { ComponentDoc, Demo } from "../../registry.ts";
import ToastDemo from "./toast-demo.tsx";
import toastDemo from "./toast-demo.tsx?raw";
import ToastPromise from "./toast-promise.tsx";
import toastPromise from "./toast-promise.tsx?raw";
import ToastTypes from "./toast-types.tsx";
import toastTypes from "./toast-types.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: toastDemo,
    component: ToastDemo,
  },
  {
    title: "Types",
    note: 'Set `type` to `success`, `info`, `warning` or `error` to show the matching icon. `priority: "high"` announces the toast at once.',
    code: toastTypes,
    component: ToastTypes,
  },
  {
    title: "Promise",
    note: "`toast.promise` shows the loading message while the promise is pending, then the success or the error message once it settles.",
    code: toastPromise,
    component: ToastPromise,
  },
];

export const doc: ComponentDoc = {
  slug: "toast",
  title: "Toast",
  description: "A succinct message that is displayed temporarily.",
  usage:
    'import { Toaster, toast } from "@barqjs/ui/toast";\n\n<Toaster />\n\ntoast.add({\n  title: "Event created",\n  description: "Sunday, December 3 at 9:00 AM",\n});',
  demos,
};
