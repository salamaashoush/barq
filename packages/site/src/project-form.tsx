/**
 * Get Code, ported from
 * `apps/v4/app/(app)/(create)/components/project-form.tsx`.
 *
 * Upstream's form names a project, picks a template and hands the whole thing
 * to their CLI. There is no project to create here, so what this hands over is
 * the two things that actually reproduce the configuration: the `barq-ui init`
 * that writes it, and the theme as CSS to paste into a project that already
 * exists.
 *
 * It is the page's whole point, which is why it gets a footer of its own and a
 * solid button while everything above it is an outline: `/create` is a
 * configurator, and a configurator you cannot get the result out of is a toy.
 */

import { createSignal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  themeCss,
} from "@barqjs/ui";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";

import { commandFor, selectionOf, type Design, type Params } from "./params.ts";

const ui = layer("barq.ui");

const code = ui({
  maxHeight: "calc(var(--spacing) * 80)",
  overflow: "auto",
  margin: "0",
  padding: "calc(var(--spacing) * 3) calc(var(--spacing) * 3.5)",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--muted)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--leading-relaxed)",
  whiteSpace: "pre",
  color: "var(--foreground)",
});

interface Pane {
  readonly id: string;
  readonly name: string;
  readonly text: (params: Params) => string;
}

const PANES: readonly Pane[] = [
  { id: "command", name: "Command", text: commandFor },
  { id: "css", name: "CSS", text: (params) => themeCss(selectionOf(params)) },
];

export function ProjectForm(props: Incoming<{ design: Design }>) {
  const [open, setOpen] = createSignal(false);
  const [showing, setShowing] = createSignal("command");
  const [took, setTook] = createSignal(false);

  const paneOf = (id: string): Pane => PANES.find((pane) => pane.id === id) ?? PANES[0]!;
  const text = (): string => paneOf(showing()).text(props.design().params());

  const copy = (): void => {
    void navigator.clipboard.writeText(text());
    setTook(true);
    setTimeout(() => setTook(false), 2000);
  };

  return (
    <Dialog isOpen={open()} onOpenChange={(next: boolean) => setOpen(next)}>
      <DialogTrigger>
        <Button data-slot="get-code">Get Code</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Code</DialogTitle>
          <DialogDescription>
            Run the command in a new project, or paste the CSS into one you already have.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          items={PANES}
          selectedKey={showing()}
          onSelectionChange={(key: string | number) => setShowing(String(key))}
        >
          <TabsList aria-label="How to take this away">
            {(pane: Pane) => <TabsTrigger>{pane.name}</TabsTrigger>}
          </TabsList>
          <TabsContent>
            {(pane: Pane) => <pre class={code}>{pane.text(props.design().params())}</pre>}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onPress={copy}>
            {took() ? <Check /> : <Copy />}
            {took() ? "Copied" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
