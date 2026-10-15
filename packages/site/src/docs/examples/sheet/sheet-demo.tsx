import { css } from "@barqjs/css";
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barqjs/ui";

const body = css`
  display: grid;
  flex: 1;
  grid-auto-rows: min-content;
  gap: calc(var(--spacing) * 6);
  padding-inline: calc(var(--spacing) * 4);
`;

const row = css`
  display: grid;
  gap: calc(var(--spacing) * 3);
`;

export default function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger>
        <Button variant="outline">Open</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div class={body}>
          <div class={row}>
            <Label for="sheet-demo-name">Name</Label>
            <Input id="sheet-demo-name" defaultValue="Salama Ashoush" />
          </div>
          <div class={row}>
            <Label for="sheet-demo-username">Username</Label>
            <Input id="sheet-demo-username" defaultValue="@salama" />
          </div>
        </div>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
          <SheetClose variant="outline">Close</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
