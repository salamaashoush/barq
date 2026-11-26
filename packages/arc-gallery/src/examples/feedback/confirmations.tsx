import { createSignal } from "@barqjs/core";
import {
  ActionMenu,
  Button,
  type DependentsCheck,
  Inline,
  Stack,
  Text,
  confirm,
} from "@barqjs/arc";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tunnelDependents(): Promise<DependentsCheck> {
  await wait(700);
  return {
    blockers: [
      { id: "c1", label: "Checkout API", href: "#checkout-api", description: "Runs every minute" },
      { id: "c2", label: "Billing webhooks", href: "#billing-webhooks" },
      { id: "l1", label: "Private runners in eu-west", href: "#eu-west" },
    ],
    blockerCount: 14,
  };
}

async function variableDependents(): Promise<DependentsCheck> {
  await wait(500);
  return {
    affected: [
      { id: "c1", label: "Homepage", description: "Reads it in step 2" },
      { id: "c2", label: "Sign-in flow" },
    ],
    affectedCount: 2,
    fallback: "They read the project's value of BASE_URL instead.",
  };
}

export default function Confirmations() {
  const [said, setSaid] = createSignal("Nothing asked yet");
  let attempts = 0;

  async function deleteLocation(): Promise<void> {
    const answer = await confirm({
      title: "Delete eu-west?",
      description: "Checks that run there move to the nearest location.",
      tone: "danger",
      confirmLabel: "Delete location",
      field: { kind: "checkbox", label: "Also delete its 3 private runners" },
    });
    setSaid(
      answer === null ? "Kept the location" : `Deleted, runners too: ${String(answer.value)}`,
    );
  }

  async function deleteRole(): Promise<void> {
    const answer = await confirm({
      title: "Delete the Auditor role?",
      description: "4 members and 1 key hold it.",
      tone: "danger",
      confirmLabel: "Delete role",
      field: {
        kind: "select",
        label: "Move its holders to",
        options: [
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
          { value: "billing", label: "Billing admin" },
        ],
      },
    });
    setSaid(answer === null ? "Kept the role" : `Holders moved to ${answer.value}`);
  }

  async function changeGrade(): Promise<void> {
    const answer = await confirm({
      title: "Change the final grade to B+?",
      confirmLabel: "Change grade",
      field: {
        kind: "text",
        label: "Reason for the change",
        multiline: true,
        description: "Kept in the audit log with your name.",
        maxLength: 500,
      },
    });
    setSaid(answer === null ? "Grade unchanged" : `Changed: “${answer.value}”`);
  }

  async function deleteProject(): Promise<void> {
    const sure = await confirm({
      title: "Delete acme-web?",
      description: "Everything in it goes for good.",
      tone: "danger",
      confirmLabel: "Delete project",
      typeToConfirm: "acme-web",
      details: () => (
        <ul>
          <li>12 checks with 3,400 runs and 9 incidents</li>
          <li>2 suites (140 runs)</li>
          <li>4 variables and secrets</li>
        </ul>
      ),
      action: async () => {
        await wait(900);
        attempts++;
        if (attempts % 2 === 1) throw new Error("project has a live browser session");
      },
    });
    setSaid(sure ? "acme-web deleted" : "Kept acme-web");
  }

  async function deleteTunnel(): Promise<void> {
    const sure = await confirm({
      title: "Delete the office tunnel?",
      tone: "danger",
      confirmLabel: "Delete tunnel",
      dependents: tunnelDependents,
    });
    setSaid(sure ? "Tunnel deleted" : "Kept the tunnel");
  }

  async function deleteVariable(): Promise<void> {
    const sure = await confirm({
      title: "Delete BASE_URL from staging?",
      tone: "danger",
      confirmLabel: "Delete variable",
      dependents: variableDependents,
    });
    setSaid(sure ? "BASE_URL deleted" : "Kept BASE_URL");
  }

  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <Button variant="outline" onPress={() => void deleteLocation()}>
          Delete with an option
        </Button>
        <Button variant="outline" onPress={() => void deleteRole()}>
          Delete and reassign
        </Button>
        <Button variant="outline" onPress={() => void changeGrade()}>
          Change with a reason
        </Button>
        <Button variant="destructive" onPress={() => void deleteProject()}>
          Type to delete
        </Button>
        <Button variant="outline" onPress={() => void deleteTunnel()}>
          Delete, blocked
        </Button>
        <Button variant="outline" onPress={() => void deleteVariable()}>
          Delete, with dependents
        </Button>
        <ActionMenu
          label="Actions for Homepage"
          actions={[
            { id: "rename", label: "Rename", icon: <Pencil />, onAction: () => setSaid("Renamed") },
            {
              id: "copy",
              label: "Duplicate",
              icon: <Copy />,
              onAction: () => setSaid("Duplicated"),
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 />,
              tone: "danger",
              confirm: {
                title: "Delete Homepage?",
                description: "Its 3,400 runs and their screenshots go with it.",
              },
              onAction: async () => {
                await wait(600);
                setSaid("Homepage deleted");
              },
            },
          ]}
        />
      </Inline>
      <Text size="sm" color="muted" aria-live="polite">
        {said()}
      </Text>
    </Stack>
  );
}
