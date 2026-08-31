/**
 * The scale, the reset and every colour theme shadcn/ui ships.
 *
 * Importing this installs the layer order and the scale, which every
 * component's CSS reads. The RESET is not here: `./reset.ts` is a separate
 * import because a component dropped into a page that already has one wants the
 * scale and not a second opinion on `margin`.
 */

import "./base.ts";

export { installTheme, themeCss, type ThemeSelection } from "./install.ts";
export { chart, tokens, type TokenName } from "./tokens.ts";
export {
  ACCENT_THEMES,
  BASE_THEMES,
  findTheme,
  THEMES,
  type ThemeDefinition,
  type ThemeTokens,
} from "./themes.ts";
