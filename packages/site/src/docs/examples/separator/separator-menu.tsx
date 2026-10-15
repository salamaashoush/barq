import { css } from "@barqjs/css";
import { Separator } from "@barqjs/ui";

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.875rem;
  line-height: 1.25rem;

  @media (min-width: 48rem) {
    gap: calc(var(--spacing) * 4);
  }
`;

const entry = css`
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
`;

const wide = css`
  display: none;

  @media (min-width: 48rem) {
    display: flex;
  }
`;

const wideRule = css`
  display: none;

  @media (min-width: 48rem) {
    display: block;
  }
`;

const name = css`
  font-weight: 500;
`;

const hint = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

export default function SeparatorMenu() {
  return (
    <div class={row}>
      <div class={entry}>
        <span class={name}>Settings</span>
        <span class={hint}>Manage preferences</span>
      </div>
      <Separator orientation="vertical" />
      <div class={entry}>
        <span class={name}>Account</span>
        <span class={hint}>Profile & security</span>
      </div>
      <Separator orientation="vertical" class={wideRule} />
      <div class={`${entry} ${wide}`}>
        <span class={name}>Help</span>
        <span class={hint}>Support & docs</span>
      </div>
    </div>
  );
}
