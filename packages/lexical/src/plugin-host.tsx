import { For, cell, createComponent, onCleanup, type Incoming } from "@barqjs/core";
import { type JSX, Portal, render } from "@barqjs/web";
import { getExtensionDependencyFromEditor, effect, signal, untracked } from "@lexical/extension";
import {
  type AnyLexicalExtension,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
  type LexicalEditor,
  configExtension,
  createCommand,
  defineExtension,
  mergeRegister,
} from "lexical";

import {
  BarqExtension,
  BarqProviderExtension,
  type DecoratorComponentProps,
  type EditorComponentProps,
} from "./barq-extension.tsx";
import { mirror } from "./hooks.ts";

export interface HostMountCommandArg {
  container: HTMLElement;
}

export interface MountPluginCommandArg {
  /** Identifies the plugin: mounting under the same key again replaces it. */
  key: string;
  /** Builds the plugin's UI; `null` unmounts it. */
  render: (() => JSX.Element) | null;
  /** Where to put it, instead of beside the editor. */
  domNode?: Element | DocumentFragment | null;
}

/** Mounts the host into a container. Handled by `BarqPluginHostExtension`. */
export const BARQ_PLUGIN_HOST_MOUNT_ROOT_COMMAND: LexicalCommand<HostMountCommandArg> =
  createCommand("BARQ_PLUGIN_HOST_MOUNT_ROOT_COMMAND");

/** Adds, replaces or removes a plugin in the host. Handled by `BarqPluginHostExtension`. */
export const BARQ_PLUGIN_HOST_MOUNT_PLUGIN_COMMAND: LexicalCommand<MountPluginCommandArg> =
  createCommand("BARQ_PLUGIN_HOST_MOUNT_PLUGIN_COMMAND");

function MountedPlugin(props: {
  plugin: MountPluginCommandArg;
  editor: LexicalEditor;
}): JSX.Element {
  const { render: build, domNode } = props.plugin;
  const editor = props.editor;
  const Boundary = getExtensionDependencyFromEditor(editor, BarqExtension).config.ErrorBoundary;
  const onError = (error: Error): void => editor._onError(error);
  if (build === null) return null;
  return domNode === null || domNode === undefined ? (
    <Boundary onError={onError}>{build()}</Boundary>
  ) : (
    <Portal mount={domNode}>
      <Boundary onError={onError}>{build()}</Boundary>
    </Portal>
  );
}

function PluginHostDecorator(props: DecoratorComponentProps): JSX.Element {
  const [editor] = props.context;
  const { mountedPluginsStore } = getExtensionDependencyFromEditor(
    editor,
    BarqPluginHostExtension,
  ).output;
  const [plugins, setPlugins] = mirror<MountPluginCommandArg[]>([]);
  onCleanup(
    effect(() => {
      setPlugins([...mountedPluginsStore.value.plugins.values()]);
    }),
  );
  return (
    <For each={plugins()}>
      {(plugin: MountPluginCommandArg) => <MountedPlugin plugin={plugin} editor={editor} />}
    </For>
  );
}

/**
 * A barq host for an editor that no `LexicalComposer` renders, such as one
 * built with `buildEditorFromExtensions` by code that is not barq. Mount the
 * host with {@link mountBarqPluginHost}, then barq UI with
 * {@link mountBarqPluginElement} and its siblings.
 */
export const BarqPluginHostExtension = defineExtension({
  build(editor) {
    const mountedPluginsStore = signal({ plugins: new Map<string, MountPluginCommandArg>() });
    return {
      mountBarqPlugin: (arg: MountPluginCommandArg): void => {
        editor.dispatchCommand(BARQ_PLUGIN_HOST_MOUNT_PLUGIN_COMMAND, arg);
      },
      mountBarqPluginHost: (container: HTMLElement): void => {
        editor.dispatchCommand(BARQ_PLUGIN_HOST_MOUNT_ROOT_COMMAND, { container });
      },
      mountedPluginsStore,
    };
  },
  dependencies: [
    BarqProviderExtension,
    configExtension(BarqExtension, { decorators: [PluginHostDecorator] }),
  ],
  name: "@barqjs/lexical/BarqPluginHost",
  register(editor, _config, state) {
    let dispose: (() => void) | undefined;
    const { mountedPluginsStore } = state.getOutput();
    const { Component } = state.getDependency(BarqExtension).output;
    return mergeRegister(
      () => {
        dispose?.();
        dispose = undefined;
        untracked(() => mountedPluginsStore.value.plugins.clear());
      },
      editor.registerCommand(
        BARQ_PLUGIN_HOST_MOUNT_PLUGIN_COMMAND,
        (arg) => {
          untracked(() => {
            const { plugins } = mountedPluginsStore.value;
            plugins.set(arg.key, arg);
            mountedPluginsStore.value = { plugins };
          });
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        BARQ_PLUGIN_HOST_MOUNT_ROOT_COMMAND,
        ({ container }) => {
          if (dispose !== undefined)
            throw new Error("[barq] BarqPluginHostExtension: the host is already mounted");
          dispose = render(
            () =>
              createComponent<EditorComponentProps, JSX.Element>(Component, {
                contentEditable: cell(null),
              }),
            container,
          );
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  },
});

/** Mounts `editor`'s barq host into `container`. Call it once, before mounting plugins. */
export function mountBarqPluginHost(editor: LexicalEditor, container: HTMLElement): void {
  getExtensionDependencyFromEditor(editor, BarqPluginHostExtension).output.mountBarqPluginHost(
    container,
  );
}

/** Mounts barq UI into `editor`'s host: the lowest-level entry point. */
export function mountBarqPluginElement(editor: LexicalEditor, opts: MountPluginCommandArg): void {
  getExtensionDependencyFromEditor(editor, BarqPluginHostExtension).output.mountBarqPlugin(opts);
}

/** Mounts a component with `props` into `editor`'s host, or unmounts it when `props` is `null`. */
export function mountBarqPluginComponent<P extends object>(
  editor: LexicalEditor,
  opts: {
    key: string;
    Component: (props: P) => JSX.Element;
    props: P | null;
    domNode?: Element | DocumentFragment | null;
  },
): void {
  const { Component, props, key, domNode } = opts;
  mountBarqPluginElement(editor, {
    key,
    domNode,
    render:
      props === null
        ? null
        : () =>
            createComponent(
              Component,
              Object.fromEntries(
                Object.entries(props).map(([name, value]) => [name, cell(value)]),
              ) as Incoming<P>,
            ),
  });
}

/** Mounts the `Component` an extension outputs, with `props`, into `editor`'s host. */
export function mountBarqExtensionComponent(
  editor: LexicalEditor,
  opts: {
    extension: AnyLexicalExtension;
    props: object | null;
    key: string;
    domNode?: Element | DocumentFragment | null;
  },
): void {
  const { extension, ...rest } = opts;
  const output = getExtensionDependencyFromEditor(editor, extension).output as {
    Component?: (props: object) => JSX.Element;
  };
  const Component = output.Component;
  if (Component === undefined) {
    throw new Error(`[barq] The extension ${extension.name} outputs no Component to mount.`);
  }
  mountBarqPluginComponent(editor, { ...rest, Component });
}
