import { Button } from "@barqjs/ui";
import { installTheme } from "@barqjs/ui/theme";

installTheme({ base: "neutral", accent: "blue" });

export default function App() {
  return <Button variant="outline">Click me</Button>;
}
