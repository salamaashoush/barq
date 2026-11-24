import { For, createSignal } from "@barqjs/core";
import { Button, Code, Grid, Heading, Inline, Stack, TONES, Text, arc, tone } from "@barqjs/arc";
import {
  edge,
  gap,
  layout,
  motion,
  motionTokens,
  radius,
  rounded,
  space,
  surface,
  zIndex,
} from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { tokens } from "@barqjs/ui/theme/tokens";

const demo = layer("demo");

const swatch = demo(edge.all, rounded.md, { height: space.x10 });
const toneCard = demo(surface.card, layout.column, gap[2], { padding: space.x3 });
const scaleBar = demo(rounded.xs, { height: space.x3, backgroundColor: tokens.primary });
const corner = demo(edge.all, {
  width: space.x12,
  height: space.x12,
  backgroundColor: tokens.muted,
});
const lane = demo(rounded.full, layout.relative, {
  height: space.x2,
  backgroundColor: tokens.muted,
});
const puck = demo(rounded.full, motion.transform, {
  position: "absolute",
  insetBlockStart: "calc(var(--spacing) * -1)",
  width: space.x4,
  height: space.x4,
  backgroundColor: tokens.primary,
  "[data-moved]": { translate: "calc(100cqw - var(--spacing) * 4) 0" },
});
const track = demo(layout.container);

const COLOURS = [
  ["background", tokens.background],
  ["foreground", tokens.foreground],
  ["card", tokens.card],
  ["popover", tokens.popover],
  ["primary", tokens.primary],
  ["secondary", tokens.secondary],
  ["muted", tokens.muted],
  ["accent", tokens.accent],
  ["destructive", tokens.destructive],
  ["border", tokens.border],
  ["input", tokens.input],
  ["ring", tokens.ring],
  ["sunken", arc.sunken],
  ["link", arc.link],
  ["faint-foreground", arc.faintForeground],
  ["border-strong", arc.borderStrong],
  ["selection", arc.selection],
  ["overlay", arc.overlay],
] as const;

const SPACES = Object.entries(space).filter(([step]) => step !== "x0");
const RADII = Object.entries(radius);
const DURATIONS = [
  ["fast", demo({ transitionDuration: { default: motionTokens.fast, [on.reducedMotion]: "0s" } })],
  ["base", demo({ transitionDuration: { default: motionTokens.base, [on.reducedMotion]: "0s" } })],
  ["slow", demo({ transitionDuration: { default: motionTokens.slow, [on.reducedMotion]: "0s" } })],
] as const;

export default function Tokens() {
  const [moved, setMoved] = createSignal(false);
  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Heading level={4}>Colour</Heading>
        <Grid minItemWidth="8rem" gap={3}>
          <For each={COLOURS}>
            {([name, value]) => (
              <Stack gap={1}>
                <div class={swatch} style={{ "background-color": value }} />
                <Text size="xs" mono>
                  --{name}
                </Text>
              </Stack>
            )}
          </For>
        </Grid>
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Tones</Heading>
        <Grid minItemWidth="10rem" gap={3}>
          <For each={TONES}>
            {(name) => (
              <div class={toneCard} style={{ "background-color": tone(name).subtle }}>
                <div class={swatch} style={{ "background-color": tone(name).base }} />
                <Text weight="strong">{name}</Text>
                <Text size="xs" mono>
                  --{name}, -foreground, -subtle
                </Text>
              </div>
            )}
          </For>
        </Grid>
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Spacing</Heading>
        <Text size="sm" color="muted">
          Multiples of one --spacing token, so a density change moves all of them.
        </Text>
        <Stack gap={2}>
          <For each={SPACES}>
            {([step, value]) => (
              <Inline gap={3} align="center">
                <Code>space.{step}</Code>
                <div class={scaleBar} style={{ width: value }} />
              </Inline>
            )}
          </For>
        </Stack>
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Radius</Heading>
        <Inline gap={4} wrap>
          <For each={RADII}>
            {([step, value]) => (
              <Stack gap={1} align="center">
                <div class={corner} style={{ "border-radius": value }} />
                <Code>{step}</Code>
              </Stack>
            )}
          </For>
        </Inline>
      </Stack>

      <Stack gap={3}>
        <Inline justify="between" align="center">
          <Heading level={4}>Motion</Heading>
          <Button variant="outline" size="sm" onPress={() => setMoved(!moved())}>
            {moved() ? "Back" : "Play"}
          </Button>
        </Inline>
        <Stack gap={3}>
          <For each={DURATIONS}>
            {([name, speed]) => (
              <Stack gap={1}>
                <Code>--duration-{name}, --ease-standard</Code>
                <div class={track}>
                  <div class={lane}>
                    <div class={demo(puck, speed)} data-moved={moved() ? "" : undefined} />
                  </div>
                </div>
              </Stack>
            )}
          </For>
        </Stack>
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Stacking</Heading>
        <Inline gap={2} wrap>
          <For each={Object.entries(zIndex)}>
            {([name, value]) => (
              <Code>
                {name}: {value}
              </Code>
            )}
          </For>
        </Inline>
      </Stack>
    </Stack>
  );
}
