import { For } from "@barqjs/core";
import {
  Button,
  Field,
  FieldLabel,
  Kbd,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Stack,
  Switch,
  ThemeToggle,
  ToggleGroup,
  ToggleGroupItem,
  openCommandMenu,
} from "@barqjs/arc";
import { gap, layout, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Search } from "@barqjs/lucide/icons/search";
import { SlidersHorizontal } from "@barqjs/lucide/icons/sliders-horizontal";
import { Smartphone } from "@barqjs/lucide/icons/smartphone";
import { Tablet } from "@barqjs/lucide/icons/tablet";
import { on } from "@barqjs/ui/conditions";

import { DENSITIES, PRESET_GROUPS, type Preset, type SettingsApi } from "./settings.ts";

const gallery = layer("gallery");

const bar = gallery(layout.row, gap[1]);
const panel = gallery({ width: space.x16, minWidth: "18rem" });
const wide = gallery(layout.fill);
const searchLabel = gallery({ display: { default: "none", [on.md]: "inline" } });
const viewports = gallery({ display: { default: "none", [on.md]: "flex" } });

const VIEWPORT_ICONS = { desktop: Monitor, tablet: Tablet, phone: Smartphone } as const;

/** The gallery's top bar: search, the viewport frame, the look, light and dark. */
export function Controls(props: { api: SettingsApi }) {
  const settings = () => props.api.settings();
  return (
    <div class={bar} data-slot="gallery-controls">
      <Button variant="outline" size="sm" onPress={() => openCommandMenu()}>
        <Search />
        <span class={searchLabel}>Search components</span>
        <Kbd>⌘K</Kbd>
      </Button>
      <ToggleGroup
        class={viewports}
        type="single"
        variant="outline"
        size="sm"
        aria-label="Viewport"
        value={settings().viewport}
        onValueChange={(value) => {
          if (typeof value === "string" && value !== "") {
            props.api.set({ viewport: value === "desktop" ? "" : value });
          }
        }}
      >
        <For each={["desktop", "tablet", "phone"] as const}>
          {(id: keyof typeof VIEWPORT_ICONS) => {
            const Icon = VIEWPORT_ICONS[id];
            return (
              <ToggleGroupItem value={id} aria-label={`${id} width`}>
                <Icon />
              </ToggleGroupItem>
            );
          }}
        </For>
      </ToggleGroup>
      <Popover>
        <PopoverTrigger>
          <Button variant="ghost" size="icon" aria-label="Customize">
            <SlidersHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class={panel}>
          <Stack gap={4}>
            <PopoverHeader>
              <PopoverTitle>Customize</PopoverTitle>
              <PopoverDescription>
                Every example follows these, and the frame does too.
              </PopoverDescription>
            </PopoverHeader>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <Select
                value={settings().preset.id}
                onValueChange={(value) =>
                  props.api.set({ theme: value === "neutral" ? "" : value })
                }
              >
                <SelectTrigger class={wide} aria-label="Theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <For each={PRESET_GROUPS}>
                    {(group: (typeof PRESET_GROUPS)[number]) => (
                      <SelectGroup>
                        <SelectLabel>{group.label}</SelectLabel>
                        <For each={group.presets}>
                          {(preset: Preset) => (
                            <SelectItem value={preset.id}>{preset.label}</SelectItem>
                          )}
                        </For>
                      </SelectGroup>
                    )}
                  </For>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Density</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-label="Density"
                value={settings().density}
                onValueChange={(value) => {
                  if (typeof value === "string" && value !== "") {
                    props.api.set({ density: value === "comfortable" ? "" : value });
                  }
                }}
              >
                <For each={DENSITIES}>
                  {(density: string) => (
                    <ToggleGroupItem value={density}>{density}</ToggleGroupItem>
                  )}
                </For>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>Direction</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-label="Direction"
                value={settings().dir}
                onValueChange={(value) => {
                  if (typeof value === "string" && value !== "") {
                    props.api.set({ dir: value === "ltr" ? "" : value });
                  }
                }}
              >
                <ToggleGroupItem value="ltr">LTR, English</ToggleGroupItem>
                <ToggleGroupItem value="rtl">RTL, Arabic</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="gallery-contrast"
                checked={settings().contrast}
                onCheckedChange={(checked: boolean) =>
                  props.api.set({ contrast: checked ? "high" : "" })
                }
              />
              <FieldLabel for="gallery-contrast">High contrast</FieldLabel>
            </Field>
          </Stack>
        </PopoverContent>
      </Popover>
      <ThemeToggle />
    </div>
  );
}
