import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleArrowDownLeftExit(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 12a10 10 0 1 1 10 10" />
      <path d="m2 22 10-10" />
      <path d="M8 22H2v-6" />
    </svg>
  );
}
