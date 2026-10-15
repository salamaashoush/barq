import { createSignal } from "@barqjs/core";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  toast,
} from "@barqjs/ui";

const items = [
  { name: "scope", required: true },
  { name: "tests", required: true },
];

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireDialog() {
  const [open, setOpen] = createSignal(false);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    setOpen(false);
    toast("Clarification sent", {
      description: `Scope: ${answer(data.get("scope"))} · Verification: ${answer(data.get("tests"))}`,
    });
  }

  return (
    <Dialog isOpen={open()} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline">Open clarification</Button>
      </DialogTrigger>
      <DialogContent>
        <Questionnaire defaultItem="scope" items={items} onSubmit={handleSubmit}>
          <QuestionnaireItem aria-labelledby="questionnaire-dialog-scope" name="scope" required>
            <DialogHeader>
              <QuestionnaireProgress />
              <DialogTitle>
                <QuestionnaireTitle id="questionnaire-dialog-scope">
                  Which files are in scope?
                </QuestionnaireTitle>
              </DialogTitle>
              <DialogDescription>
                <QuestionnaireDescription>
                  Choose how broadly the agent can update the workspace.
                </QuestionnaireDescription>
              </DialogDescription>
            </DialogHeader>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="component">Component only</QuestionnaireChoice>
              <QuestionnaireChoice value="feature">Complete feature directory</QuestionnaireChoice>
              <QuestionnaireChoice value="workspace">
                Any related workspace file
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
          <QuestionnaireItem aria-labelledby="questionnaire-dialog-tests" name="tests" required>
            <DialogHeader>
              <QuestionnaireProgress />
              <DialogTitle>
                <QuestionnaireTitle id="questionnaire-dialog-tests">
                  How much verification is needed?
                </QuestionnaireTitle>
              </DialogTitle>
              <DialogDescription>
                <QuestionnaireDescription>
                  Choose the checks the agent should run before handoff.
                </QuestionnaireDescription>
              </DialogDescription>
            </DialogHeader>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="targeted">Targeted tests</QuestionnaireChoice>
              <QuestionnaireChoice value="package">Package tests</QuestionnaireChoice>
              <QuestionnaireChoice value="full">Full workspace verification</QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
          <DialogFooter>
            <DialogClose type="button" variant="outline">
              Cancel
            </DialogClose>
            <QuestionnaireActions>
              <QuestionnairePrevious />
              <QuestionnaireNext>Next</QuestionnaireNext>
              <QuestionnaireSubmit>Send answer</QuestionnaireSubmit>
            </QuestionnaireActions>
          </DialogFooter>
        </Questionnaire>
      </DialogContent>
    </Dialog>
  );
}
