/**
 * The order this package's own rules cascade in, declared before any of them.
 *
 * Everything here is layered and nothing an application writes has to be, which
 * is the whole point: an unlayered rule beats a layered one whatever the
 * specificity, so `<Button class={mine}>` wins without `!important` and without
 * anyone reasoning about which module the bundler emitted first.
 *
 * The order is load-bearing in one place. `barq.reset` styles elements
 * (`button { background: transparent }`, 0-0-1) and `barq.ui` styles classes
 * (0-1-0), so specificity would already decide — but a reset that landed AFTER
 * the components would win anyway, because that is what a later layer does.
 * Declaring the order here means it never depends on import order.
 *
 * Every module that registers a rule imports this one, so the declaration
 * cannot arrive second. A layer's position is fixed by its FIRST appearance,
 * and `@layer barq.ui { … }` reaching the page before this statement would
 * put the components at the front.
 *
 * `barq.style` is LAST, and a cascade layer overriding specificity is exactly
 * what it is for here. One of shadcn's eight styles is a whole second opinion
 * about how a component looks, and it has to beat the component's own rules
 * whatever they weigh: `[data-slot="button"]` inside `.style-nova` is 0-2-0
 * against an atom's 0-1-0 and would usually win, but an atom under a condition
 * is 0-2-0 too and the tie would fall to import order. A later layer settles it
 * without either side counting.
 *
 * The cost, and it is real: an application whose own reset is unlayered beats
 * these components. `@layer` your reset, or import `./reset.ts` instead.
 */

import { globalCss } from "@barqjs/css";

globalCss`
@layer barq.reset, barq.base, barq.theme, barq.ui, barq.style;
`;
