import { createSignal } from "@barqjs/core";
import {
  ColorArea,
  ColorEditor,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatches,
  Grid,
  Stack,
  Text,
} from "@barqjs/arc";

const PALETTE = [
  { color: "#2563EB", label: "Ocean" },
  { color: "#16A34A", label: "Forest" },
  { color: "#D97706", label: "Amber" },
  { color: "#DC2626", label: "Signal" },
  { color: "#7C3AED", label: "Violet" },
  { color: "#0F172A", label: "Ink" },
];

export default function Colors() {
  const [brand, setBrand] = createSignal<string | null>("#2563EB");
  const [label, setLabel] = createSignal<string | null>("#16A34A");
  const [highlight, setHighlight] = createSignal("hsb(32, 85%, 95%)");
  const [overlay, setOverlay] = createSignal("#0F172A80");

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Stack gap={5}>
        <ColorPicker
          label="Brand colour"
          description="Used for buttons and links across the Acme workspace."
          value={brand()}
          onChange={setBrand}
          swatches={PALETTE}
        />
        <ColorField label="Brand, as hex" value={brand()} onChange={setBrand} />
        <ColorSwatches label="Label colour" colors={PALETTE} value={label()} onChange={setLabel} />
        <ColorSwatches
          aria-label="Small round swatches"
          colors={PALETTE.map((one) => one.color)}
          shape="circle"
          size="sm"
          defaultValue="#7C3AED"
        />
        <ColorPicker label="Accent, disabled" defaultValue="#D97706" isDisabled />
        <ColorField
          label="Border"
          isInvalid
          errorMessage="Use a colour with at least 3:1 contrast."
          defaultValue="#F4F4F5"
        />
        <ColorPicker label="Chart colour" placeholder="Pick a chart colour" />
      </Stack>

      <Stack gap={5}>
        <Stack gap={2}>
          <Text weight="medium">Highlight, by area and hue</Text>
          <ColorArea
            value={highlight()}
            onChange={setHighlight}
            xChannel="saturation"
            yChannel="brightness"
          />
          <ColorSlider channel="hue" value={highlight()} onChange={setHighlight} />
          <Text size="xs" color="muted" mono>
            {highlight()}
          </Text>
        </Stack>
        <Stack gap={2}>
          <Text weight="medium">Overlay, with opacity</Text>
          <ColorEditor value={overlay()} onChange={setOverlay} alpha swatches={PALETTE} />
          <Text size="xs" color="muted" mono>
            {overlay()}
          </Text>
        </Stack>
        <ColorSlider
          channel="alpha"
          defaultValue="#2563EB"
          isDisabled
          aria-label="Opacity, disabled"
        />
      </Stack>
    </Grid>
  );
}
