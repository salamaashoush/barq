import { Show, createSignal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Input,
  Label,
  useIsMobile,
} from "@barqjs/ui";

const dialog = css`
  @media (width >= 40rem) {
    max-width: 425px;
  }
`;

const start = css`
  text-align: start;
`;

const form = css`
  display: grid;
  align-items: start;
  gap: calc(var(--spacing) * 6);
`;

const padded = css`
  padding-inline: calc(var(--spacing) * 4);
`;

const row = css`
  display: grid;
  gap: calc(var(--spacing) * 3);
`;

const footer = css`
  padding-top: calc(var(--spacing) * 2);
`;

function ProfileForm(props: Incoming<{ class?: string; id: string }>) {
  return (
    <form class={`${form} ${props.class?.() ?? ""}`}>
      <div class={row}>
        <Label for={`${props.id()}-email`}>Email</Label>
        <Input type="email" id={`${props.id()}-email`} defaultValue="salama@example.com" />
      </div>
      <div class={row}>
        <Label for={`${props.id()}-username`}>Username</Label>
        <Input id={`${props.id()}-username`} defaultValue="@salama" />
      </div>
      <Button type="submit">Save changes</Button>
    </form>
  );
}

export default function DrawerDialog() {
  const [open, setOpen] = createSignal(false);
  const isMobile = useIsMobile();

  return (
    <Show
      when={isMobile()}
      fallback={
        <Dialog isOpen={open()} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button variant="outline">Edit Profile</Button>
          </DialogTrigger>
          <DialogContent class={dialog}>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Make changes to your profile here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <ProfileForm id="drawer-dialog-dialog" />
          </DialogContent>
        </Dialog>
      }
    >
      <Drawer open={open()} onOpenChange={setOpen}>
        <DrawerTrigger>
          <Button variant="outline">Edit Profile</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader class={start}>
            <DrawerTitle>Edit profile</DrawerTitle>
            <DrawerDescription>
              Make changes to your profile here. Click save when you're done.
            </DrawerDescription>
          </DrawerHeader>
          <ProfileForm class={padded} id="drawer-dialog-drawer" />
          <DrawerFooter class={footer}>
            <DrawerClose variant="outline">Cancel</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Show>
  );
}
