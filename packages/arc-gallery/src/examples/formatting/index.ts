import type { Demos } from "../../gallery/types.ts";
import Dates from "./dates.tsx";
import dates from "./dates.tsx?raw";
import Durations from "./durations.tsx";
import durations from "./durations.tsx?raw";
import Numbers from "./numbers.tsx";
import numbers from "./numbers.tsx?raw";
import ReaderClock from "./reader-clock.tsx";
import readerClock from "./reader-clock.tsx?raw";

export const demos: Demos = {
  numbers: { component: Numbers, code: numbers },
  dates: { component: Dates, code: dates },
  durations: { component: Durations, code: durations },
  "reader-clock": { component: ReaderClock, code: readerClock },
};
