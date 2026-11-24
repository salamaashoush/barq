import { For, createSignal } from "@barqjs/core";
import {
  Button,
  Inline,
  Label,
  NativeSelect,
  NativeSelectOption,
  Stack,
  Text,
  toast,
} from "@barqjs/arc";
import { CodeEditor, loadLanguage } from "@barqjs/arc/code";

import { SNIPPETS } from "../../data/snippets.ts";

const LANGUAGES = ["typescript", "python", "sql", "json", "css", "yaml", "markdown"];

export default function CodeEditorExample() {
  const [language, setLanguage] = createSignal("typescript");
  const [code, setCode] = createSignal(SNIPPETS["typescript"] ?? "");
  const [ready, setReady] = createSignal<readonly string[]>([]);

  const choose = (next: string): void => {
    setLanguage(next);
    setCode(SNIPPETS[next] ?? "");
  };

  return (
    <Stack gap={3}>
      <Inline gap={3} align="end" wrap>
        <Stack gap={1.5}>
          <Label for="code-language">Language</Label>
          <NativeSelect
            id="code-language"
            value={language()}
            onChange={(event: Event) => choose((event.currentTarget as HTMLSelectElement).value)}
          >
            <For each={LANGUAGES}>
              {(name) => <NativeSelectOption value={name}>{name}</NativeSelectOption>}
            </For>
          </NativeSelect>
        </Stack>
        <Button
          variant="outline"
          onPress={() =>
            void (async () => {
              await Promise.all(LANGUAGES.map((name) => loadLanguage(name)));
              setReady(LANGUAGES);
            })()
          }
        >
          Preload every language
        </Button>
        <Text size="sm" color="muted">
          {ready().length === 0
            ? "Each language loads the first time it is shown."
            : "All languages loaded."}
        </Text>
      </Inline>
      <CodeEditor
        label="Source"
        description="Mod+Enter runs it."
        language={language()}
        value={code()}
        onChange={setCode}
        onSubmit={() => toast.success(`Ran ${code().split("\n").length} lines of ${language()}`)}
        minHeight={200}
        maxHeight={360}
      />
      <Text size="xs" color="muted" numeric>
        {code().length} characters
      </Text>
    </Stack>
  );
}
