import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarTrigger,
} from "@barqjs/ui";

const bar = css`
  width: calc(var(--spacing) * 72);
`;

export default function MenubarRadio() {
  const [user, setUser] = createSignal("mira");
  const [theme, setTheme] = createSignal("system");

  return (
    <Menubar class={bar}>
      <MenubarMenu>
        <MenubarTrigger>Profiles</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup value={user()} onValueChange={setUser}>
            <MenubarRadioItem value="salama">Salama</MenubarRadioItem>
            <MenubarRadioItem value="mira">Mira</MenubarRadioItem>
            <MenubarRadioItem value="omar">Omar</MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarItem inset>Edit...</MenubarItem>
          <MenubarItem inset>Add Profile...</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Theme</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup value={theme()} onValueChange={setTheme}>
            <MenubarRadioItem value="light">Light</MenubarRadioItem>
            <MenubarRadioItem value="dark">Dark</MenubarRadioItem>
            <MenubarRadioItem value="system">System</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
