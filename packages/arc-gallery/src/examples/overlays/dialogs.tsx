import { createSignal } from "@barqjs/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Inline,
  Input,
  Stack,
  Text,
  confirm,
} from "@barqjs/arc";

export default function Dialogs() {
  const [name, setName] = createSignal("Acme Cloud");
  const [draft, setDraft] = createSignal(name());
  const [open, setOpen] = createSignal(false);
  const [result, setResult] = createSignal("Nothing decided yet");

  const removeProject = async (): Promise<void> => {
    const sure = await confirm({
      title: `Delete ${name()}?`,
      description:
        "Its checks, alerts and history are removed for everyone. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete project",
    });
    setResult(sure ? `${name()} deleted` : "Kept the project");
  };

  const leave = async (): Promise<void> => {
    const sure = await confirm({
      title: "Leave without saving?",
      confirmLabel: "Leave",
      cancelLabel: "Stay",
    });
    setResult(sure ? "Left the page" : "Stayed");
  };

  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <Dialog
          isOpen={open()}
          onOpenChange={(next: boolean) => {
            if (next) setDraft(name());
            setOpen(next);
          }}
        >
          <DialogTrigger>
            <Button variant="outline">Rename project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>
                The name shows on the status page and in every alert.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel for="project-name">Name</FieldLabel>
              <Input
                id="project-name"
                value={draft()}
                onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
              />
            </Field>
            <DialogFooter>
              <DialogClose>Cancel</DialogClose>
              <Button
                isDisabled={draft().trim() === ""}
                onPress={() => {
                  setName(draft().trim());
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger>
            <Button variant="outline">Revoke API key</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
              <AlertDialogDescription>
                Deploys that use it start failing at once.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onPress={() => setResult("Key revoked")}>Revoke</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button variant="destructive" onPress={() => void removeProject()}>
          Delete project
        </Button>
        <Button variant="ghost" onPress={() => void leave()}>
          Leave page
        </Button>
      </Inline>
      <Text size="sm" color="muted" aria-live="polite">
        Project: {name()}. {result()}.
      </Text>
    </Stack>
  );
}
