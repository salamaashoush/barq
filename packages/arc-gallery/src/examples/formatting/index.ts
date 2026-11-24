import type { Demos } from "../../gallery/types.ts";
import Dates from "./dates.tsx";
import dates from "./dates.tsx?raw";
import Durations from "./durations.tsx";
import durations from "./durations.tsx?raw";
import Numbers from "./numbers.tsx";
import numbers from "./numbers.tsx?raw";

export const demos: Demos = {
  numbers: { component: Numbers, code: numbers },
  dates: { component: Dates, code: dates },
  durations: { component: Durations, code: durations },
};
