import { createSignal } from "@barqjs/core";
import { ActionBar, Stack, Text } from "@barqjs/arc";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Download } from "@barqjs/lucide/icons/download";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Printer } from "@barqjs/lucide/icons/printer";
import { Send } from "@barqjs/lucide/icons/send";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

const INVOICE_ACTIONS = [
  { id: "send", label: "Send", icon: <Send />, priority: 5 },
  { id: "edit", label: "Edit", icon: <Pencil />, priority: 4 },
  { id: "pdf", label: "Download PDF", icon: <Download />, priority: 3 },
  { id: "duplicate", label: "Duplicate", icon: <Copy />, priority: 2 },
  { id: "print", label: "Print", icon: <Printer />, priority: 1 },
  { id: "void", label: "Void", icon: <Trash2 />, tone: "danger" as const },
];

export default function ActionBars() {
  const [last, setLast] = createSignal<string | null>(null);
  return (
    <Stack gap={5}>
      <ActionBar aria-label="Invoice 1042" actions={INVOICE_ACTIONS} onAction={setLast} />
      <Text size="sm" color="muted" aria-live="polite">
        {last() === null
          ? "Narrow the window: lower priorities move into More."
          : `Ran “${last() ?? ""}”.`}
      </Text>
      <ActionBar
        aria-label="Compact invoice actions"
        size="sm"
        variant="ghost"
        actions={[
          { id: "edit", label: "Edit", icon: <Pencil />, iconOnly: true },
          { id: "copy", label: "Duplicate", icon: <Copy />, iconOnly: true },
          { id: "print", label: "Print", icon: <Printer />, iconOnly: true, isDisabled: true },
        ]}
        onAction={setLast}
      />
      <ActionBar
        aria-label="Wrapping actions"
        overflow="wrap"
        variant="secondary"
        actions={INVOICE_ACTIONS}
        onAction={setLast}
      />
      <ActionBar
        aria-label="Locked invoice"
        isDisabled
        actions={INVOICE_ACTIONS.slice(0, 3)}
        onAction={setLast}
      />
    </Stack>
  );
}
