export {
  type LexicalComposerContextType,
  type LexicalComposerContextWithEditor,
  LexicalComposerContext,
  useLexicalComposerContext,
  useLexicalEditor,
} from "./context.ts";

export { type InitialConfig, type LexicalComposerProps, LexicalComposer } from "./composer.tsx";

export {
  type BarqConfig,
  type BarqOutputs,
  type DecoratorComponentProps,
  type DecoratorComponentType,
  type EditorComponentProps,
  type EditorComponentType,
  type RootComponentType,
  BarqExtension,
  BarqProviderExtension,
} from "./barq-extension.tsx";

export {
  type ContentEditableElementProps,
  type ContentEditableProps,
  type PlaceholderContent,
  ContentEditable,
  ContentEditableElement,
} from "./content-editable.tsx";

export {
  type ErrorBoundaryProps,
  type ErrorBoundaryType,
  type LexicalErrorBoundaryProps,
  LexicalErrorBoundary,
} from "./error-boundary.tsx";

export {
  type Decoration,
  type SerializedDecoratorBlockNode,
  $isDecoratorBlockNode,
  DecoratorBlockNode,
} from "./decorator-block-node.ts";

export {
  type LexicalSubscription,
  useLexicalCanShowPlaceholder,
  useLexicalEditable,
  useLexicalEditorState,
  useLexicalIsTextContentEmpty,
  useLexicalNodeSelection,
  useLexicalSlotRef,
  useLexicalSubscription,
  useLexicalTextEntity,
} from "./hooks.ts";

export {
  type ComponentOf,
  type SignalValue,
  useExtensionComponent,
  useExtensionDependency,
  useExtensionSignalValue,
  useOptionalExtensionDependency,
  usePeerExtensionDependency,
  useSignalValue,
} from "./extension-hooks.ts";

export {
  type FocusManagerOptions,
  type FocusTrapInitialFocus,
  type RegisteringRef,
  type RovingTabIndexOptions,
  useLexicalAriaLiveRegion,
  useLexicalFocusManagerRef,
  useLexicalFocusTrapRef,
  useLexicalRovingTabIndexRef,
} from "./a11y.ts";

export { type OnChangePluginProps, OnChangePlugin } from "./on-change.ts";

export { MenuOption, SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND } from "./menu-option.ts";
export {
  type MenuRenderFn,
  type MenuRenderProps,
  type MenuResolution,
  type MenuTextMatch,
  type SelectOptionFn,
  type TriggerFn,
} from "./menu.tsx";
export {
  type BasicTriggerOptions,
  type TypeaheadMenuPluginProps,
  LexicalTypeaheadMenuPlugin,
  PUNCTUATION,
  basicTypeaheadTriggerMatch,
} from "./typeahead.tsx";
export { type NodeMenuPluginProps, LexicalNodeMenuPlugin } from "./node-menu.tsx";

export {
  type HostMountCommandArg,
  type MountPluginCommandArg,
  BARQ_PLUGIN_HOST_MOUNT_PLUGIN_COMMAND,
  BARQ_PLUGIN_HOST_MOUNT_ROOT_COMMAND,
  BarqPluginHostExtension,
  mountBarqExtensionComponent,
  mountBarqPluginComponent,
  mountBarqPluginElement,
  mountBarqPluginHost,
} from "./plugin-host.tsx";
