/**
 * Every component, rendered the way the documentation shows it, against the
 * ARIA checker.
 *
 * `expectNoAriaViolations` has existed in `@barqjs/testing` since before this
 * package did, with seven rules in it, and NOT ONE of the 32 test files here
 * called it. That is the gap this closes, and it is a coverage gap rather than
 * a checker gap: `duplicate-id` would have caught a checkbox writing its id on
 * two elements the first time anyone rendered one with an id, and no test in
 * the package ever gave one an id.
 *
 * THE DOCS' OWN SHAPE, which is the part that matters. A component rendered
 * the way its unit test finds convenient is not the component an application
 * writes: `<Checkbox>I agree</Checkbox>` passes everything and
 * `<Label for="terms" /> <Checkbox id="terms" />` did not, and the second is
 * what every example on the site and in shadcn's docs looks like.
 *
 * What is NOT here is what a headless DOM cannot answer — focus lifetime, hit
 * testing, an animation, a computed box. Those belong in a browser, and
 * `PORTING.md` step 8 is where they are.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ariaViolations, render } from "@barqjs/testing";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion.tsx";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { AspectRatio } from "./ui/aspect-ratio.tsx";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./ui/attachment.tsx";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "./ui/avatar.tsx";
import { Badge } from "./ui/badge.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb.tsx";
import { Bubble, BubbleContent } from "./ui/bubble.tsx";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./ui/button-group.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "./ui/field.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group.tsx";
import { Input, Textarea } from "./ui/input.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";
import { Label } from "./ui/label.tsx";
import { Marker, MarkerContent } from "./ui/marker.tsx";
import { Message, MessageContent, MessageFooter, MessageHeader } from "./ui/message.tsx";
import { NativeSelect } from "./ui/native-select.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination.tsx";
import { Progress } from "./ui/progress.tsx";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group.tsx";
import { ScrollArea } from "./ui/scroll-area.tsx";
import { Separator } from "./ui/separator.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Slider } from "./ui/slider.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { Switch } from "./ui/switch.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";
import { Toggle } from "./ui/toggle.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";

import type { Ui } from "@barqjs/testing";

function AlertExample() {
  return (
    <Alert>
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Your trial ends in three days.</AlertDescription>
    </Alert>
  );
}

function AspectRatioExample() {
  return (
    <AspectRatio ratio={16 / 9}>
      <div>16 / 9</div>
    </AspectRatio>
  );
}

function AttachmentExample() {
  return (
    <AttachmentGroup>
      <Attachment>
        <AttachmentMedia />
        <AttachmentContent>
          <AttachmentTitle>report.pdf</AttachmentTitle>
          <AttachmentDescription>2.4 MB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    </AttachmentGroup>
  );
}

function AvatarExample() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
  );
}

function BadgeExample() {
  return <Badge variant="secondary">Verified</Badge>;
}

function BreadcrumbExample() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Invoices</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BubbleExample() {
  return (
    <Bubble align="end">
      <BubbleContent>Just now, yes.</BubbleContent>
    </Bubble>
  );
}

function ButtonExample() {
  return <Button variant="outline">Save</Button>;
}

function ButtonGroupExample() {
  return (
    <ButtonGroup aria-label="Actions">
      <ButtonGroupText>https://</ButtonGroupText>
      <Button variant="outline">Copy</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Paste</Button>
    </ButtonGroup>
  );
}

function CardExample() {
  return (
    <Card>
      <CardHeader bordered>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>Everything billed this year.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            New
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Twelve invoices.</CardContent>
      <CardFooter bordered>
        <Button size="sm">Export</Button>
      </CardFooter>
    </Card>
  );
}

function CheckboxExample() {
  return (
    <>
      <Checkbox id="terms" />
      <Label for="terms">Accept the terms</Label>
    </>
  );
}

function CollapsibleExample() {
  return (
    <Collapsible>
      <CollapsibleTrigger>Show details</CollapsibleTrigger>
      <CollapsibleContent>Hidden until asked for.</CollapsibleContent>
    </Collapsible>
  );
}

function EmptyExample() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" />
        <EmptyTitle>No invoices yet</EmptyTitle>
        <EmptyDescription>They appear here once you send one.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function FieldExample() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="street">Street</FieldLabel>
        <Input id="street" />
        <FieldDescription>Where the parcel goes.</FieldDescription>
      </Field>
      {/* The LABEL wraps the row, which is upstream's own shape for a
            checkbox with a title beside it: `FieldTitle` is a `<div>` there too,
            so it names nothing on its own and the control would have no
            accessible name at all. */}
      <FieldLabel for="receipts">
        <Field orientation="horizontal">
          <Checkbox id="receipts" />
          <FieldContent>
            <FieldTitle>Send receipts</FieldTitle>
            <FieldDescription>One email per payment.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </FieldGroup>
  );
}

function InputExample() {
  return (
    <>
      <Label for="email">Email</Label>
      <Input id="email" type="email" />
    </>
  );
}

function InputGroupExample() {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput aria-label="Domain" />
    </InputGroup>
  );
}

function ItemExample() {
  return (
    <ItemGroup>
      <Item variant="outline">
        <ItemMedia variant="icon" />
        <ItemContent>
          <ItemTitle>Q3 report</ItemTitle>
          <ItemDescription>Uploaded two days ago.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </ItemActions>
      </Item>
      <ItemSeparator />
    </ItemGroup>
  );
}

function KbdExample() {
  return (
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  );
}

function MarkerExample() {
  return (
    <Marker variant="separator">
      <MarkerContent>Yesterday</MarkerContent>
    </Marker>
  );
}

function MessageExample() {
  return (
    <Message align="start">
      <MessageContent>
        <MessageHeader>Mira</MessageHeader>
        <Bubble align="start" variant="muted">
          <BubbleContent>Did the build go out?</BubbleContent>
        </Bubble>
        <MessageFooter>09:41</MessageFooter>
      </MessageContent>
    </Message>
  );
}

function NativeSelectExample() {
  return (
    <>
      <Label for="country">Country</Label>
      <NativeSelect id="country">
        <option>United Kingdom</option>
      </NativeSelect>
    </>
  );
}

function PaginationExample() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            1
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function ProgressExample() {
  return <Progress value={62} label="Upload" />;
}

function RadioGroupExample() {
  return (
    <RadioGroup label="Size" defaultValue="m">
      <RadioGroupItem value="s" id="size-s" />
      <Label for="size-s">Small</Label>
      <RadioGroupItem value="m" id="size-m" />
      <Label for="size-m">Medium</Label>
    </RadioGroup>
  );
}

function ScrollAreaExample() {
  return (
    <ScrollArea aria-label="Log">
      <div>Line 1</div>
    </ScrollArea>
  );
}

function SeparatorExample() {
  return <Separator />;
}

function SkeletonExample() {
  return <Skeleton />;
}

function SliderExample() {
  return <Slider aria-label="Volume" defaultValue={30} />;
}

function SpinnerExample() {
  return <Spinner />;
}

function SwitchExample() {
  return (
    <>
      <Switch id="wifi" defaultSelected />
      <Label for="wifi">Wi-Fi</Label>
    </>
  );
}

function TableExample() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow isSelected>
          <TableCell>INV001</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function TextareaExample() {
  return (
    <>
      <Label for="notes">Notes</Label>
      <Textarea id="notes" />
    </>
  );
}

function ToggleExample() {
  return <Toggle aria-label="Bold">B</Toggle>;
}

function ToggleGroupExample() {
  return (
    <ToggleGroup type="multiple" variant="outline" aria-label="Format">
      <ToggleGroupItem value="bold" aria-label="Bold">
        B
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        I
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function AccordionExample() {
  return (
    <Accordion items={[{ id: "a", q: "Is it accessible?", a: "Yes." }]}>
      {(faq: { q: string; a: string }) => (
        <AccordionItem>
          <AccordionTrigger>{faq.q}</AccordionTrigger>
          <AccordionContent>{faq.a}</AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}

/**
 * One entry per component, and the markup is the DOCS' example rather than the
 * smallest thing that renders.
 *
 * COMPONENTS, not arrows in an object. `render` gives a component a scope and
 * an arrow stored on a property is not one, so every `provide` in the tree had
 * nothing to provide on — the slider and the accordion both threw
 * "This must be rendered inside a …" from their own context read.
 */
const EXAMPLES: readonly { name: string; component: Ui }[] = [
  { name: "Alert", component: AlertExample },
  { name: "AspectRatio", component: AspectRatioExample },
  { name: "Attachment", component: AttachmentExample },
  { name: "Avatar", component: AvatarExample },
  { name: "Badge", component: BadgeExample },
  { name: "Breadcrumb", component: BreadcrumbExample },
  { name: "Bubble", component: BubbleExample },
  { name: "Button", component: ButtonExample },
  { name: "ButtonGroup", component: ButtonGroupExample },
  { name: "Card", component: CardExample },
  { name: "Checkbox", component: CheckboxExample },
  { name: "Collapsible", component: CollapsibleExample },
  { name: "Empty", component: EmptyExample },
  { name: "Field", component: FieldExample },
  { name: "Input", component: InputExample },
  { name: "InputGroup", component: InputGroupExample },
  { name: "Item", component: ItemExample },
  { name: "Kbd", component: KbdExample },
  { name: "Marker", component: MarkerExample },
  { name: "Message", component: MessageExample },
  { name: "NativeSelect", component: NativeSelectExample },
  { name: "Pagination", component: PaginationExample },
  { name: "Progress", component: ProgressExample },
  { name: "RadioGroup", component: RadioGroupExample },
  { name: "ScrollArea", component: ScrollAreaExample },
  { name: "Separator", component: SeparatorExample },
  { name: "Skeleton", component: SkeletonExample },
  { name: "Slider", component: SliderExample },
  { name: "Spinner", component: SpinnerExample },
  { name: "Switch", component: SwitchExample },
  { name: "Table", component: TableExample },
  { name: "Textarea", component: TextareaExample },
  { name: "Toggle", component: ToggleExample },
  { name: "ToggleGroup", component: ToggleGroupExample },
  { name: "Accordion", component: AccordionExample },
];

describe("every component, as the docs render it", () => {
  for (const example of EXAMPLES) {
    test(example.name, () => {
      const { container } = render(example.component);
      const found = ariaViolations(container).map(
        (entry) => `[${entry.rule}] ${entry.message} ${entry.html}`,
      );
      expect(found).toEqual([]);
    });
  }
});

/**
 * An element on its way out keeps its last frame.
 *
 * `presence` in `@barqjs/aria` removes the whole subtree on ONE timer, the
 * longest exit anywhere under the element. An element whose own animation is
 * shorter therefore finishes early, and with `animation-fill-mode: none` it
 * reverts to its PRE-animation frame and sits there until the removal catches
 * up. Measured in a browser on the dialog: the overlay faded to 0.004 over
 * 138ms, snapped back to opacity 1 at 151ms, and was still on screen at 219ms.
 * A modal that flashes fully opaque on its way out is what that looks like.
 *
 * Asserted on the RULE rather than in a browser, because happy-dom runs no
 * animations at all: what can be checked here is that every exit rule the
 * package ships declares the fill mode, and that is the thing that was missing.
 */
describe("closing", () => {
  /**
   * Read from the SOURCE, because an atom is one declaration per class: the
   * `animation: exit …` and the `--ui-animation-fill-mode: forwards` are two
   * different classes and never share a block in the stylesheet, so there is
   * nothing to assert about a rule. What can be asserted is that a component
   * declaring one declares the other, which is the thing a new overlay will
   * forget.
   */
  test("every exit animation declares the fill mode beside it", () => {
    const directory = new URL("./", import.meta.url).pathname;
    const offenders: string[] = [];
    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const path = join(at, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        if (entry.name.includes(".test.")) continue;
        const lines = readFileSync(path, "utf8").split("\n");
        for (const [index, line] of lines.entries()) {
          if (!line.includes('"exit var(--ui-animation-duration')) continue;
          const near = lines.slice(index, index + 3).join("\n");
          if (near.includes('"--ui-animation-fill-mode": "forwards"')) continue;
          offenders.push(`${entry.name}:${String(index + 1)}`);
        }
      }
    };
    walk(directory);
    expect(offenders).toEqual([]);
  });
});
