import type { Demo } from "../../registry.ts";
import DatePickerComponent from "./date-picker-component.tsx";
import datePickerComponent from "./date-picker-component.tsx?raw";
import DateRangePickerExample from "./date-range-picker.tsx";
import dateRangePicker from "./date-range-picker.tsx?raw";
import DatePickerDemo from "./date-picker-demo.tsx";
import datePickerDemo from "./date-picker-demo.tsx?raw";
import DatePickerBasic from "./date-picker-basic.tsx";
import datePickerBasic from "./date-picker-basic.tsx?raw";
import DatePickerRange from "./date-picker-range.tsx";
import datePickerRange from "./date-picker-range.tsx?raw";
import DatePickerDob from "./date-picker-dob.tsx";
import datePickerDob from "./date-picker-dob.tsx?raw";
import DatePickerInput from "./date-picker-input.tsx";
import datePickerInput from "./date-picker-input.tsx?raw";
import DatePickerTime from "./date-picker-time.tsx";
import datePickerTime from "./date-picker-time.tsx?raw";
import DataPickerWithDropdowns from "./data-picker-with-dropdowns.tsx";
import dataPickerWithDropdowns from "./data-picker-with-dropdowns.tsx?raw";
import DatePickerRtl from "./date-picker-rtl.tsx";
import datePickerRtl from "./date-picker-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: datePickerDemo,
    component: DatePickerDemo,
  },
  {
    title: "Basic",
    note: "A basic date picker component.",
    code: datePickerBasic,
    component: DatePickerBasic,
  },
  {
    title: "Range Picker",
    note: 'A date picker for selecting a range of dates: a `Calendar` with `mode="range"` and two months.',
    code: datePickerRange,
    component: DatePickerRange,
  },
  {
    title: "Date of Birth",
    note: "A date picker with a dropdown caption layout for selecting a date of birth.",
    code: datePickerDob,
    component: DatePickerDob,
  },
  {
    title: "Input",
    note: "A date picker with an input field for typing the date; ArrowDown opens the calendar.",
    code: datePickerInput,
    component: DatePickerInput,
  },
  {
    title: "Time Picker",
    note: "A date picker beside a time input.",
    code: datePickerTime,
    component: DatePickerTime,
  },
  {
    title: "With Dropdowns",
    note: "A dropdown caption and a footer button that closes the popover.",
    code: dataPickerWithDropdowns,
    component: DataPickerWithDropdowns,
  },
  {
    title: "DatePicker",
    note: "The same composition as one component: `DatePicker` is a `Popover` around a `Calendar`, and `presets` adds a select of relative dates above it.",
    align: "start",
    code: datePickerComponent,
    component: DatePickerComponent,
  },
  {
    title: "DateRangePicker",
    note: "`DateRangePicker` is the range composition as one component.",
    align: "start",
    code: dateRangePicker,
    component: DateRangePickerExample,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider`, put `dir` on an element you own and provide the locale with `provideLocale`.",
    rtl: true,
    code: datePickerRtl,
    component: DatePickerRtl,
  },
];
