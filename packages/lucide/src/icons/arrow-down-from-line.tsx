import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownFromLine(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 3H5" />
      <path d="M12 21V7" />
      <path d="m6 15 6 6 6-6" />
    </svg>
  );
}
