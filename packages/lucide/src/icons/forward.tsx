import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Forward(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m15 17 5-5-5-5" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </svg>
  );
}
