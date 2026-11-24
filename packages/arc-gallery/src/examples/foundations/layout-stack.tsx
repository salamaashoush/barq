import { Badge, Center, Container, Grid, Inline, Stack, Text } from "@barqjs/arc";
import { bg, layout, rounded, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");

const box = demo(surface.card, layout.centre, { minHeight: space.x12, padding: space.x3 });
const well = demo(bg.sunken, rounded.lg, { padding: space.x4 });

export default function LayoutStack() {
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Stack, a gap of 3, wider from md
        </Text>
        <Stack gap={{ base: 2, md: 3 }}>
          <div class={box}>Invoice #1042</div>
          <div class={box}>Invoice #1043</div>
          <div class={box}>Invoice #1044</div>
        </Stack>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Inline, justified between, stacked below the container's md step
        </Text>
        <Inline justify="between" align="center" stackBelow="cqMd" gap={3}>
          <Text weight="strong">Acme Cloud</Text>
          <Inline gap={2} wrap>
            <Badge>Production</Badge>
            <Badge variant="secondary">eu-west-1</Badge>
            <Badge variant="outline">v2.4.1</Badge>
          </Inline>
        </Inline>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Grid, one column then two then four by the container
        </Text>
        <Grid columns={{ base: 1, cqSm: 2, cqLg: 4 }} gap={3}>
          <div class={box}>Revenue</div>
          <div class={box}>Customers</div>
          <div class={box}>Churn</div>
          <div class={box}>Uptime</div>
        </Grid>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Grid by minimum item width
        </Text>
        <Grid minItemWidth="10rem" gap={2}>
          <div class={box}>North</div>
          <div class={box}>South</div>
          <div class={box}>East</div>
          <div class={box}>West</div>
          <div class={box}>Central</div>
        </Grid>
      </Stack>
      <div class={well}>
        <Container size="sm">
          <Center>
            <Text color="muted">Container size sm, its content centred</Text>
          </Center>
        </Container>
      </div>
    </Stack>
  );
}
