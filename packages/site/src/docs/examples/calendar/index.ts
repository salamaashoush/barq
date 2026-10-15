import type { Demo } from "../../registry.ts";
import CalendarBasic from "./calendar-basic.tsx";
import calendarBasic from "./calendar-basic.tsx?raw";
import CalendarBookedDates from "./calendar-booked-dates.tsx";
import calendarBookedDates from "./calendar-booked-dates.tsx?raw";
import CalendarCaption from "./calendar-caption.tsx";
import calendarCaption from "./calendar-caption.tsx?raw";
import CalendarCustomDays from "./calendar-custom-days.tsx";
import calendarCustomDays from "./calendar-custom-days.tsx?raw";
import CalendarDemo from "./calendar-demo.tsx";
import calendarDemo from "./calendar-demo.tsx?raw";
import CalendarPresets from "./calendar-presets.tsx";
import calendarPresets from "./calendar-presets.tsx?raw";
import CalendarRange from "./calendar-range.tsx";
import calendarRange from "./calendar-range.tsx?raw";
import CalendarRtl from "./calendar-rtl.tsx";
import calendarRtl from "./calendar-rtl.tsx?raw";
import CalendarTime from "./calendar-time.tsx";
import calendarTime from "./calendar-time.tsx?raw";
import CalendarWeekNumbers from "./calendar-week-numbers.tsx";
import calendarWeekNumbers from "./calendar-week-numbers.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: calendarDemo, component: CalendarDemo },
  {
    title: "Basic",
    note: "A basic calendar component. A border and a radius come from a `class` of your own.",
    size: "auto",
    code: calendarBasic,
    component: CalendarBasic,
  },
  {
    title: "Range Calendar",
    note: 'Use the `mode="range"` prop to enable range selection. The value is `{ start, end }`, and each end is a `CalendarDate`.',
    size: "auto",
    code: calendarRange,
    component: CalendarRange,
  },
  {
    title: "Month and Year Selector",
    note: 'Use `captionLayout="dropdown"` to show month and year dropdowns.',
    size: "auto",
    code: calendarCaption,
    component: CalendarCaption,
  },
  {
    title: "Presets",
    note: "Keep the month in a signal with `month` and `onMonthChange`, so a preset can turn the calendar to the day it chooses.",
    size: "auto",
    code: calendarPresets,
    component: CalendarPresets,
  },
  {
    title: "Date and Time Picker",
    size: "auto",
    code: calendarTime,
    component: CalendarTime,
  },
  {
    title: "Booked dates",
    note: "Pass the booked days to `disabled`, name them in `modifiers`, and give the name a class in `modifiersClassNames`.",
    size: "auto",
    code: calendarBookedDates,
    component: CalendarBookedDates,
  },
  {
    title: "Custom Cell Size",
    note: "Set `--cell-size` on the calendar to size its days, and use `renderDay` to draw what goes inside each one.",
    size: "auto",
    code: calendarCustomDays,
    component: CalendarCustomDays,
  },
  {
    title: "Week Numbers",
    note: "Use `showWeekNumber` to show week numbers.",
    size: "auto",
    code: calendarWeekNumbers,
    component: CalendarWeekNumbers,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. `provideLocale` sets the language the months and weekdays are written in.",
    size: "auto",
    rtl: true,
    code: calendarRtl,
    component: CalendarRtl,
  },
];
