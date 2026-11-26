import { Repl, Stack, Text } from "@barqjs/arc";

import { Calculator } from "./data.ts";

export default function ReplExample() {
  const calculator = new Calculator();
  return (
    <Stack gap={4}>
      <Text size="sm">
        Try <code>let rate = 40</code>, <code>(rate * 1.5</code> then Enter for a second line,{" "}
        <code>count(5)</code> and Stop, or <code>nope</code> for an error.
      </Text>
      <Repl
        aria-label="Calculator"
        storageKey="gallery-calculator"
        banner="calc 1.0, a toy language. Ctrl+L clears, Ctrl+C stops."
        history={["let width = 12", "width * 7"]}
        height={280}
        onSubmit={(code, signal) => calculator.run(code, signal)}
      />
      <Repl
        aria-label="Loading calculator"
        isDisabled
        placeholder="The calculator is still loading."
        height={96}
        onSubmit={(code, signal) => calculator.run(code, signal)}
      />
    </Stack>
  );
}
