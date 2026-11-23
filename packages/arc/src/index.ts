export * from "@barqjs/ui";
export { ConfirmHost, type ConfirmOptions, confirm } from "./components/confirm.tsx";
export { ArcProvider, type ArcProviderProps } from "./components/provider.tsx";
export { PageHeader, type PageHeaderProps } from "./components/page-header.tsx";
export {
  Status,
  type StatusProps,
  type StatusVariant,
  statusVariants,
} from "./components/status.tsx";
export {
  ARC_DARK,
  ARC_LIGHT,
  TONES,
  type ArcThemeSelection,
  type Tone,
  arc,
  arcThemeCss,
  arcThemeValues,
  installArcTheme,
  tone,
} from "./theme/index.ts";
