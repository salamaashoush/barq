import { css } from "@barqjs/css";
import { Label, Switch } from "@barqjs/ui";

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export default function SwitchDemo() {
  return (
    <div class={row}>
      <Switch id="switch-demo-airplane-mode" />
      <Label for="switch-demo-airplane-mode">Airplane Mode</Label>
    </div>
  );
}
