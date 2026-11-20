import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronFirst(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m17 18-6-6 6-6" />
      <path d="M7 6v12" />
    </svg>
  );
}
