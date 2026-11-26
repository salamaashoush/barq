import {
  FileExplorer,
  IconButton,
  Repl,
  type ReplHandle,
  type TabItem,
  Text,
  nameOf,
  virtualFs,
} from "@barqjs/arc";
import { CodeEditor, EditorTabs } from "@barqjs/arc/code";
import { FileCode } from "@barqjs/lucide/icons/file-code";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui/resizable";
import { createSignal } from "@barqjs/core";

import { Calculator, WORKSPACE } from "./data.ts";

export default function WorkspaceExample() {
  const fs = virtualFs(WORKSPACE);
  const calculator = new Calculator();
  const [open, setOpen] = createSignal<string[]>(["src/main.calc"]);
  const [active, setActive] = createSignal<string | undefined>("src/main.calc");
  const [drafts, setDrafts] = createSignal<Record<string, string>>({});
  let repl: ReplHandle | undefined;

  function show(path: string): void {
    if (fs.entry(path)?.kind !== "file") return;
    if (!open().includes(path)) setOpen([...open(), path]);
    setActive(path);
  }
  function textOf(path: string): string {
    return drafts()[path] ?? fs.read(path) ?? "";
  }
  function save(path: string): void {
    const draft = drafts()[path];
    if (draft === undefined) return;
    fs.write(path, draft);
    const rest = { ...drafts() };
    delete rest[path];
    setDrafts(rest);
  }
  function tabs(): TabItem[] {
    return open().map((path) => ({
      id: path,
      label: nameOf(path),
      title: path,
      dirty: drafts()[path] !== undefined,
    }));
  }
  function retarget(from: string, to: string): void {
    function moved(path: string): string {
      return path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
    }
    setOpen(open().map(moved));
    const current = active();
    if (current !== undefined) setActive(moved(current));
    setDrafts(
      Object.fromEntries(Object.entries(drafts()).map(([path, text]) => [moved(path), text])),
    );
  }
  function forget(gone: string): void {
    function kept(path: string): boolean {
      return path !== gone && !path.startsWith(`${gone}/`);
    }
    setOpen(open().filter(kept));
    if (!kept(active() ?? "")) setActive(open()[0]);
  }

  return (
    <ResizablePanelGroup autoSaveId="gallery-workspace" style={{ height: "34rem" }}>
      <ResizablePanel id="workspace-files" defaultSize={26} minSize="12rem">
        <FileExplorer
          fs={fs}
          title="Calculator"
          activePath={active()}
          onOpen={show}
          dirtyPaths={Object.keys(drafts())}
          onMove={retarget}
          onDelete={forget}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="workspace-main" defaultSize={74}>
        <ResizablePanelGroup autoSaveId="gallery-workspace-main" orientation="vertical">
          <ResizablePanel id="workspace-editor" defaultSize={60} minSize={20}>
            <EditorTabs
              aria-label="Open files"
              items={tabs()}
              selectedKey={active()}
              onSelectionChange={setActive}
              onClose={(ids) => {
                setOpen(open().filter((path) => !ids.includes(path)));
                const rest = { ...drafts() };
                for (const id of ids) delete rest[id];
                setDrafts(rest);
              }}
              onReorder={setOpen}
              empty={<Text color="muted">Open a file from the tree.</Text>}
            >
              {(tab) => (
                <CodeEditor
                  label={tab.title ?? tab.label}
                  value={textOf(tab.id)}
                  onChange={(text) => setDrafts({ ...drafts(), [tab.id]: text })}
                  onSubmit={() => save(tab.id)}
                  language="typescript"
                  minHeight="100%"
                />
              )}
            </EditorTabs>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="workspace-repl" defaultSize={40} minSize={15}>
            <Repl
              aria-label="Calculator"
              fill
              actions={
                <IconButton
                  label="Run the open file"
                  size="sm"
                  onPress={() => {
                    const path = active();
                    if (path !== undefined) repl?.run(textOf(path));
                  }}
                >
                  <FileCode />
                </IconButton>
              }
              handle={(given) => {
                repl = given;
              }}
              onSubmit={(code, signal) => calculator.run(code, signal)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
