import { css } from "@barqjs/css";
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
  Field,
  FieldGroup,
  Input,
  Label,
} from "@barqjs/ui";

const narrow = css`
  @media (width >= 40rem) {
    max-width: 24rem;
  }
`;

export default function DialogDemo() {
  return (
    <Dialog>
      <form>
        <DialogTrigger>
          <Button variant="outline">Open Dialog</Button>
        </DialogTrigger>
        <DialogContent class={narrow}>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label for="dialog-demo-name">Name</Label>
              <Input id="dialog-demo-name" name="dialog-demo-name" defaultValue="Salama" />
            </Field>
            <Field>
              <Label for="dialog-demo-username">Username</Label>
              <Input id="dialog-demo-username" name="dialog-demo-username" defaultValue="@salama" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  );
}
