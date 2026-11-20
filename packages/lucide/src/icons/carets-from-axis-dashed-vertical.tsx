import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CaretsFromAxisDashedVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 14v2" />
      <path d="M12 20v2" />
      <path d="M12 2v2" />
      <path d="M12 8v2" />
      <path d="M17.712 16.703A1 1 0 0 1 15.999 16V8a1 1 0 0 1 1.713-.703l3.99 3.991a1 1 0 0 1 .001 1.424z" />
      <path d="M6.288 16.703A1 1 0 0 0 8.001 16V8a1 1 0 0 0-1.713-.703l-3.99 3.991a1 1 0 0 0-.001 1.424z" />
    </svg>
  );
}
