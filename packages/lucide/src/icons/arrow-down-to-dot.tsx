import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownToDot(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v14" />
      <path d="m19 9-7 7-7-7" />
      <circle cx="12" cy="21" r="1" />
    </svg>
  );
}
