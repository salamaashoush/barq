import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ReplyAll(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m12 17-5-5 5-5" />
      <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
      <path d="m7 17-5-5 5-5" />
    </svg>
  );
}
