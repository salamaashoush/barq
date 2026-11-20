import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ExclamationMark(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 15V4" />
      <path d="M12 20h.01" />
    </svg>
  );
}
