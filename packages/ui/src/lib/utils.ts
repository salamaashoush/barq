/**
 * `cn`, which shadcn's copied components all call.
 *
 * There it is `twMerge(clsx(…))`, and the `twMerge` half exists because two
 * Tailwind classes setting the same property are decided by the stylesheet
 * rather than by the call. `atoms` answers that question by construction: one
 * class per property, merged by the call, so the later argument wins because it
 * is later. That makes this closer to shadcn's `cn` than a plain join ever was.
 *
 * A class that is not one of ours — an application's own, arriving through a
 * `class` prop — carries no property to merge on, so it is kept as it is and
 * survives whatever follows it.
 */

export { atoms as cn } from "@barqjs/css";
export type { AtomInput as ClassValue } from "@barqjs/css";
