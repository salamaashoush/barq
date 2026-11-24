import type { Demos } from "../../gallery/types.ts";
import Dashboard from "./dashboard.tsx";
import dashboard from "./dashboard.tsx?raw";

export const demos: Demos = {
  dashboard: { component: Dashboard, code: dashboard },
};
