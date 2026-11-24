import { createSignal } from "@barqjs/core";
import {
  Button,
  DescriptionList,
  DetailSheet,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Field,
  FieldLabel,
  Inline,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Stack,
  Status,
  Text,
} from "@barqjs/arc";
import { layer } from "@barqjs/css";
import { space } from "@barqjs/arc/style";

const demo = layer("demo");
const body = demo({ paddingInline: space.x4 });

export default function Sheets() {
  const [invoice, setInvoice] = createSignal(false);
  const [goal, setGoal] = createSignal(350);
  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <Sheet>
          <SheetTrigger>
            <Button variant="outline">Edit profile</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Profile</SheetTitle>
              <SheetDescription>How teammates see you across Acme.</SheetDescription>
            </SheetHeader>
            <div class={body}>
              <Field>
                <FieldLabel for="sheet-name">Name</FieldLabel>
                <Input id="sheet-name" defaultValue="Salama" />
              </Field>
            </div>
            <SheetFooter>
              <SheetClose variant="outline">Close</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger>
            <Button variant="outline">Filters from the start</Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Opens from the start of the line, whichever side that is.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>

        <Drawer>
          <DrawerTrigger>
            <Button variant="outline">Daily goal</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Daily goal</DrawerTitle>
              <DrawerDescription>Drag down to close on a phone.</DrawerDescription>
            </DrawerHeader>
            <Inline gap={3} justify="center" align="center">
              <Button
                variant="outline"
                size="icon"
                aria-label="Lower"
                onPress={() => setGoal(Math.max(100, goal() - 50))}
              >
                −
              </Button>
              <Text size="lg" weight="strong" numeric>
                {goal()} kcal
              </Text>
              <Button
                variant="outline"
                size="icon"
                aria-label="Raise"
                onPress={() => setGoal(goal() + 50)}
              >
                +
              </Button>
            </Inline>
            <DrawerFooter>
              <DrawerClose>
                <Button variant="outline">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Button onPress={() => setInvoice(true)}>Open invoice #1042</Button>
      </Inline>

      <DetailSheet
        open={invoice()}
        onOpenChange={setInvoice}
        heading="Invoice #1042"
        description="Acme Logistics, issued Nov 1"
        size="md"
        footer={
          <Inline gap={2}>
            <Button variant="outline" onPress={() => setInvoice(false)}>
              Close
            </Button>
            <Button onPress={() => setInvoice(false)}>Send reminder</Button>
          </Inline>
        }
      >
        <DescriptionList
          items={[
            { term: "Status", details: <Status tone="warning">Overdue</Status> },
            { term: "Amount", details: "$4,200.00" },
            { term: "Billing contact", details: "salama@example.com" },
            { term: "Due", details: "Dec 1, 2026" },
          ]}
        />
      </DetailSheet>
    </Stack>
  );
}
