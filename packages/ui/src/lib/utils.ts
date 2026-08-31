/**
 * `cn`, which shadcn's copied components all call.
 *
 * There it is `twMerge(clsx(…))`, and the `twMerge` half exists because two
 * Tailwind classes setting the same property are decided by the stylesheet
 * rather than by the call. That question is answered a layer up here: every
 * rule this package writes is inside `@layer barq.ui` and an application's is
 * not, so a caller's class wins whatever order the bundler chose. What is left
 * is the joining, which is `clsx`.
 *
 * When two classes of YOUR OWN conflict, `atoms` from `@barqjs/css` is the tool
 * that answers it: one class per property, merged by the call.
 */

export { clsx as cn } from "@barqjs/css";
export type { ClassValue } from "@barqjs/css";
