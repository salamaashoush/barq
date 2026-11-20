import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Reply(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      <path d="m9 17-5-5 5-5" />
    </svg>
  );
}
