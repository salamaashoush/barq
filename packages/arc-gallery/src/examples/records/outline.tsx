import { type OutlineNode, OutlineView, Stack, Text } from "@barqjs/arc";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";

const PROGRAM: OutlineNode[] = [
  {
    id: "1",
    label: "repeat 4 times",
    tone: "info",
    children: [
      { id: "2", label: "move forward" },
      {
        id: "3",
        label: "if the path is blocked",
        tone: "warning",
        children: [{ id: "4", label: "turn left" }],
      },
    ],
  },
  { id: "5", label: "pick up the star", tone: "success" },
];

const PLAN: OutlineNode[] = [
  {
    id: "u1",
    label: "Unit 1: Fractions",
    children: [
      { id: "l1", label: "Halves and quarters" },
      { id: "l2", label: "Comparing fractions" },
      { id: "l3", label: "Fractions on a number line" },
    ],
  },
  {
    id: "u2",
    label: "Unit 2: Measures",
    children: [
      { id: "l4", label: "Length in centimetres and metres" },
      { id: "l5", label: "Telling the time to five minutes" },
    ],
  },
];

const MOVES: OutlineNode[] = [
  { id: "m1", label: "up", icon: <ArrowUp /> },
  { id: "m2", label: "up", icon: <ArrowUp /> },
  { id: "m3", label: "right", icon: <ArrowRight /> },
  { id: "m4", label: "down", icon: <ArrowDown /> },
];

export default function OutlineExample() {
  return (
    <Stack gap={8}>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          A program, as pills
        </Text>
        <OutlineView aria-label="Program" look="pills" nodes={PROGRAM} />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          A course plan, as lines with guides
        </Text>
        <OutlineView aria-label="Course plan" guides ordered={false} nodes={PLAN} />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Moves, in a row
        </Text>
        <OutlineView aria-label="Moves" flow="inline" look="pills" nodes={MOVES} />
      </Stack>
    </Stack>
  );
}
