import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Plus } from "@barqjs/lucide/icons/plus";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import {
  Button,
  Chart,
  ChartContainer,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  srOnly,
  type ChartConfig,
} from "@barqjs/ui";

const data = [400, 300, 200, 300, 200, 278, 189, 239, 300, 200, 278, 189, 349].map((goal, day) => ({
  day: String(day + 1),
  goal,
}));

const config: ChartConfig = [{ key: "goal", label: "Daily goals", color: "var(--chart-1)" }];

const definition = defineChart({
  marks: [barY(data, { x: "day", y: "goal" })],
  scales: {
    x: {
      scale: scaleBand,
      axis: false,
    },
    y: { scale: scaleLinear, axis: false },
  },
  color: { domain: ["goal"], range: ["var(--color-goal)"] },
  theme: {
    foreground: "var(--foreground)",
    muted: "var(--muted-foreground)",
    grid: "var(--border)",
    background: "transparent",
  },
});

const column = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

const body = css`
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 4) 0;
`;

const controls = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

const round = css`
  height: calc(var(--spacing) * 8);
  width: calc(var(--spacing) * 8);
  flex-shrink: 0;
  border-radius: 9999px;
`;

const readout = css`
  flex: 1;
  text-align: center;
`;

const figure = css`
  font-size: 4.5rem;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.05em;
`;

const unit = css`
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--muted-foreground);
`;

const plot = css`
  margin-top: calc(var(--spacing) * 3);
  height: 120px;
`;

export default function DrawerDemo() {
  const [goal, setGoal] = createSignal(350);

  const adjust = (adjustment: number): void => {
    setGoal(Math.max(200, Math.min(400, goal() + adjustment)));
  };

  return (
    <Drawer>
      <DrawerTrigger>
        <Button variant="outline">Open Drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div class={column}>
          <DrawerHeader>
            <DrawerTitle>Move Goal</DrawerTitle>
            <DrawerDescription>Set your daily activity goal.</DrawerDescription>
          </DrawerHeader>
          <div class={body}>
            <div class={controls}>
              <Button
                variant="outline"
                size="icon"
                class={round}
                onPress={() => adjust(-10)}
                disabled={goal() <= 200}
              >
                <Minus />
                <span class={srOnly}>Decrease</span>
              </Button>
              <div class={readout}>
                <div class={figure}>{goal().toLocaleString("en-US")}</div>
                <div class={unit}>Calories/day</div>
              </div>
              <Button
                variant="outline"
                size="icon"
                class={round}
                onPress={() => adjust(10)}
                disabled={goal() >= 400}
              >
                <Plus />
                <span class={srOnly}>Increase</span>
              </Button>
            </div>
            <ChartContainer config={config} class={plot}>
              <Chart definition={definition} ariaLabel="Daily goals" height={120} />
            </ChartContainer>
          </div>
          <DrawerFooter>
            <Button>Submit</Button>
            <DrawerClose variant="outline">Cancel</DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
