import { createSignal } from "@barqjs/core";
import { Button, Inline, ShareDialog, Stack, Text } from "@barqjs/arc";
import { readUrlState } from "@barqjs/primitives/url-state";
import { Share2 } from "@barqjs/lucide/icons/share-2";

interface Workspace {
  files: Record<string, string>;
  open: string[];
}

const WORKSPACE: Workspace = {
  files: {
    "src/main.toy":
      "import stats\n\nlet total = 0\nfor n in 1..100 {\n  total += n\n}\nprint stats.mean([total, 10, 20])\n",
    "src/stats.toy": "fn mean(xs) {\n  return sum(xs) / len(xs)\n}\n",
  },
  open: ["src/main.toy"],
};

export default function ShareDialogExample() {
  const [read, setRead] = createSignal("");
  return (
    <Stack gap={3}>
      <Inline gap={2}>
        <ShareDialog
          state={WORKSPACE}
          stateKey="workspace"
          trigger={
            <Button variant="outline">
              <Share2 aria-hidden="true" />
              Share
            </Button>
          }
        />
        <Button
          variant="ghost"
          onPress={() => {
            void readUrlState<Workspace>({ key: "workspace" }).then((found) =>
              setRead(
                found === undefined
                  ? "No workspace in this page's address yet."
                  : `Read back ${String(Object.keys(found.files).length)} files from the address.`,
              ),
            );
          }}
        >
          Read the address
        </Button>
      </Inline>
      <div role="status">
        <Text size="sm" color="muted">
          {read()}
        </Text>
      </div>
    </Stack>
  );
}
