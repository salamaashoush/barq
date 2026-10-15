import type { Demo } from "../../registry.ts";
import ButtonAschild from "./button-aschild.tsx";
import buttonAschild from "./button-aschild.tsx?raw";
import ButtonDefault from "./button-default.tsx";
import buttonDefault from "./button-default.tsx?raw";
import ButtonDemo from "./button-demo.tsx";
import buttonDemo from "./button-demo.tsx?raw";
import ButtonDestructive from "./button-destructive.tsx";
import buttonDestructive from "./button-destructive.tsx?raw";
import ButtonGhost from "./button-ghost.tsx";
import buttonGhost from "./button-ghost.tsx?raw";
import ButtonGroupDemo from "./button-group-demo.tsx";
import buttonGroupDemo from "./button-group-demo.tsx?raw";
import ButtonIcon from "./button-icon.tsx";
import buttonIcon from "./button-icon.tsx?raw";
import ButtonLink from "./button-link.tsx";
import buttonLink from "./button-link.tsx?raw";
import ButtonOutline from "./button-outline.tsx";
import buttonOutline from "./button-outline.tsx?raw";
import ButtonRounded from "./button-rounded.tsx";
import buttonRounded from "./button-rounded.tsx?raw";
import ButtonRtl from "./button-rtl.tsx";
import buttonRtl from "./button-rtl.tsx?raw";
import ButtonSecondary from "./button-secondary.tsx";
import buttonSecondary from "./button-secondary.tsx?raw";
import ButtonSize from "./button-size.tsx";
import buttonSize from "./button-size.tsx?raw";
import ButtonSpinner from "./button-spinner.tsx";
import buttonSpinner from "./button-spinner.tsx?raw";
import ButtonWithIcon from "./button-with-icon.tsx";
import buttonWithIcon from "./button-with-icon.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: buttonDemo,
    component: ButtonDemo,
  },
  {
    title: "Size",
    note: "Use the `size` prop to change the size of the button.",
    size: "auto",
    code: buttonSize,
    component: ButtonSize,
  },
  {
    title: "Default",
    code: buttonDefault,
    component: ButtonDefault,
  },
  {
    title: "Outline",
    code: buttonOutline,
    component: ButtonOutline,
  },
  {
    title: "Secondary",
    code: buttonSecondary,
    component: ButtonSecondary,
  },
  {
    title: "Ghost",
    code: buttonGhost,
    component: ButtonGhost,
  },
  {
    title: "Destructive",
    code: buttonDestructive,
    component: ButtonDestructive,
  },
  {
    title: "Link",
    code: buttonLink,
    component: ButtonLink,
  },
  {
    title: "Icon",
    code: buttonIcon,
    component: ButtonIcon,
  },
  {
    title: "With Icon",
    note: 'Add `data-icon="inline-start"` or `data-icon="inline-end"` to the icon for the correct spacing.',
    code: buttonWithIcon,
    component: ButtonWithIcon,
  },
  {
    title: "Rounded",
    note: "Give the button a class with a full `border-radius` to make it rounded.",
    code: buttonRounded,
    component: ButtonRounded,
  },
  {
    title: "Spinner",
    note: "Render a `Spinner` inside the button to show a loading state.",
    code: buttonSpinner,
    component: ButtonSpinner,
  },
  {
    title: "Button Group",
    note: "To create a button group, use the `ButtonGroup` component.",
    code: buttonGroupDemo,
    component: ButtonGroupDemo,
  },
  {
    title: "As Child",
    note: "There is no `asChild` prop. Give `Button` an `href` and it renders a link that looks like a button.",
    code: buttonAschild,
    component: ButtonAschild,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: buttonRtl,
    component: ButtonRtl,
  },
];
