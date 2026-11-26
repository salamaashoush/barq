import { type TabItem, Text, Stack, confirm } from "@barqjs/arc";
import { CodeEditor, EditorTabs } from "@barqjs/arc/code";
import { createSignal } from "@barqjs/core";

interface Doc {
  id: string;
  name: string;
  saved: string;
  text: string;
  pinned: boolean;
}

const START: Doc[] = [
  { id: "main", name: "main.calc", saved: "print(6 * 7)\n", text: "print(6 * 7)\n", pinned: true },
  {
    id: "rates",
    name: "rates.calc",
    saved: "let base = 40\n",
    text: "let base = 40\nbase * 2\n",
    pinned: false,
  },
  {
    id: "units",
    name: "units.calc",
    saved: "let inch = 2.54\n",
    text: "let inch = 2.54\n",
    pinned: false,
  },
  { id: "notes", name: "notes.md", saved: "# Notes\n", text: "# Notes\n", pinned: false },
  {
    id: "long",
    name: "a-file-with-a-rather-long-name.calc",
    saved: "1\n",
    text: "1\n",
    pinned: false,
  },
];

export default function EditorTabsExample() {
  const [docs, setDocs] = createSignal(START);
  const [active, setActive] = createSignal("rates");
  function tabs(): TabItem[] {
    return docs().map((doc) => ({
      id: doc.id,
      label: doc.name,
      title: `src/${doc.name}`,
      dirty: doc.text !== doc.saved,
      pinned: doc.pinned,
    }));
  }
  async function close(ids: string[]): Promise<void> {
    const unsaved = docs().filter((doc) => ids.includes(doc.id) && doc.text !== doc.saved);
    if (unsaved.length > 0) {
      const sure = await confirm({
        title: `Close ${unsaved.map((doc) => doc.name).join(", ")} without saving?`,
        description: "The changes are lost.",
        tone: "danger",
        confirmLabel: "Close without saving",
      });
      if (!sure) return;
    }
    setDocs(docs().filter((doc) => !ids.includes(doc.id)));
  }
  function edit(id: string, text: string): void {
    setDocs(docs().map((doc) => (doc.id === id ? { ...doc, text } : doc)));
  }
  function textOf(id: string): string {
    return docs().find((doc) => doc.id === id)?.text ?? "";
  }
  return (
    <Stack gap={3}>
      <Text size="sm">
        Close with the button, a middle click or Delete; move with a drag or Ctrl+Shift+Page Up and
        Page Down; right-click a tab for the rest.
      </Text>
      <EditorTabs
        aria-label="Open files"
        items={tabs()}
        selectedKey={active()}
        onSelectionChange={setActive}
        onClose={(ids) => void close(ids)}
        onReorder={(ids) => setDocs(ids.map((id) => docs().find((doc) => doc.id === id) as Doc))}
        onPinnedChange={(id, pinned) => {
          const next = docs().map((doc) => (doc.id === id ? { ...doc, pinned } : doc));
          setDocs([...next.filter((doc) => doc.pinned), ...next.filter((doc) => !doc.pinned)]);
        }}
        empty={<Text color="muted">No file is open.</Text>}
      >
        {(tab) => (
          <CodeEditor
            label={tab.label}
            value={textOf(tab.id)}
            onChange={(text) => edit(tab.id, text)}
            language="typescript"
            minHeight={160}
          />
        )}
      </EditorTabs>
    </Stack>
  );
}
