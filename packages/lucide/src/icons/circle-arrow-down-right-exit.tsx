import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleArrowDownRightExit(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 22a10 10 0 1 1 10-10" />
      <path d="M22 22 12 12" />
      <path d="M22 16v6h-6" />
    </svg>
  );
}
