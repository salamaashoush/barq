import { For, createSignal } from "@barqjs/core";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  Stack,
  Text,
} from "@barqjs/arc";
import { gap, layout, plainList, space, type } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");
const panel = demo(plainList, layout.column, gap[1], { padding: space.x2, width: "18rem" });
const summary = demo(type.meta);

const PRODUCTS = [
  {
    title: "Checks",
    href: "https://example.com/checks",
    description: "Probe an API or a page from twelve regions.",
  },
  {
    title: "Status pages",
    href: "https://example.com/status",
    description: "Tell customers what is happening, as it happens.",
  },
  {
    title: "On-call",
    href: "https://example.com/on-call",
    description: "Page the right person and nobody else.",
  },
];

export default function NavigationMenus() {
  const [last, setLast] = createSignal("Nothing chosen yet");
  const [wrap, setWrap] = createSignal(true);
  const [panelSide, setPanelSide] = createSignal("bottom");
  return (
    <Stack gap={8}>
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul class={panel}>
                <For each={PRODUCTS}>
                  {(product) => (
                    <li>
                      <NavigationMenuLink href={product.href}>
                        <Stack gap={1}>
                          <Text size="sm" weight="medium">
                            {product.title}
                          </Text>
                          <span class={summary}>{product.description}</span>
                        </Stack>
                      </NavigationMenuLink>
                    </li>
                  )}
                </For>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="https://example.com/pricing">Pricing</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="https://example.com/docs" isActive>
              Docs
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <Stack gap={2}>
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onSelect={() => setLast("New invoice")}>
                New invoice <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => setLast("Duplicate")}>Duplicate</MenubarItem>
              <MenubarItem disabled>Print</MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Export as</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem onSelect={() => setLast("Exported PDF")}>PDF</MenubarItem>
                  <MenubarItem onSelect={() => setLast("Exported CSV")}>CSV</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarCheckboxItem checked={wrap()} onCheckedChange={setWrap}>
                Wrap long lines
              </MenubarCheckboxItem>
              <MenubarSeparator />
              <MenubarRadioGroup value={panelSide()} onValueChange={setPanelSide}>
                <MenubarRadioItem value="bottom">Panel at the bottom</MenubarRadioItem>
                <MenubarRadioItem value="end">Panel at the end</MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        <Text size="sm" color="muted">
          {last()}; wrapping {wrap() ? "on" : "off"}; panel at the {panelSide()}.
        </Text>
      </Stack>
    </Stack>
  );
}
