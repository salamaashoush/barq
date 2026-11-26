import { For, createSignal } from "@barqjs/core";
import {
  DocumentWorkflowBar,
  type DocumentStage,
  LifecycleNotice,
  RestoreButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  RelativeTime,
  toast,
  useDocumentWorkflow,
} from "@barqjs/arc";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Deleted {
  id: string;
  name: string;
  deletedAt: number;
}

const DAY = 86_400_000;

export default function Lifecycle() {
  const [archived, setArchived] = createSignal(true);
  const [deleted, setDeleted] = createSignal<readonly Deleted[]>([
    { id: "c1", name: "Slack #incidents", deletedAt: Date.now() - 2 * DAY },
    { id: "c2", name: "PagerDuty, platform", deletedAt: Date.now() - 9 * DAY },
  ]);
  const [stage, setStage] = createSignal<DocumentStage>("draft");
  const [saved, setSaved] = createSignal(
    "Checkout failed for 40 minutes after a card acquirer outage.",
  );
  const [body, setBody] = createSignal(saved());
  const workflow = useDocumentWorkflow({ stage, dirty: () => body() !== saved() });

  return (
    <Stack gap={5}>
      <Stack gap={2}>
        {archived() ? (
          <LifecycleNotice
            state="archived"
            at={Date.now() - 3 * DAY}
            by="Salama"
            name="acme-web"
            onRestore={async () => {
              await wait(500);
              setArchived(false);
              toast.success("acme-web restored");
            }}
          />
        ) : null}
        <LifecycleNotice
          state="deleted"
          placement="inline"
          at={Date.now() - DAY}
          purgeAt={Date.now() + 29 * DAY}
          name="Billing webhooks"
          onRestore={() => toast.success("Billing webhooks restored")}
        />
      </Stack>
      <Table aria-label="Recently deleted channels">
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Deleted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={deleted()}>
            {(row: Deleted) => (
              <TableRow>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <RelativeTime value={row.deletedAt} />
                </TableCell>
                <TableCell>
                  <RestoreButton
                    name={row.name}
                    onRestore={async () => {
                      await wait(400);
                      setDeleted((rows) => rows.filter((one) => one.id !== row.id));
                    }}
                  />
                </TableCell>
              </TableRow>
            )}
          </For>
        </TableBody>
      </Table>
      <Stack gap={2}>
        <DocumentWorkflowBar
          workflow={workflow}
          onSave={async (next) => {
            await wait(400);
            setSaved(body());
            setStage(next);
          }}
          onPublish={async () => {
            await wait(400);
            toast.success("Published on the status page");
          }}
        />
        <Textarea
          aria-label="Postmortem"
          rows={5}
          value={body()}
          readOnly={workflow.locked()}
          onInput={(event: Event) => setBody((event.target as HTMLTextAreaElement).value)}
        />
      </Stack>
    </Stack>
  );
}
