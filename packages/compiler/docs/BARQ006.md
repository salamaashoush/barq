# BARQ006: removed

The compiler does not report this code. [All codes](README.md)

BARQ006 warned that `<Dynamic>` read every prop once and handed the component it rendered
values that never updated. barq no longer exports `<Dynamic>` (see [BARQ025](BARQ025.md)).
The component the `dynamic` factory returns passes each prop through as the same Cell it
received, so what it renders reads current values and there is nothing to warn about:

```tsx
import { createSignal } from "@barqjs/core";
import { dynamic } from "@barqjs/web";

const [total] = createSignal(0);
const Output = dynamic(() => "output");

export const Total = () => <Output value={total()} />;
```

## If a comment still names it

`BARQ006` is not a code the compiler knows, so a comment that names it is reported as
[BARQ009](BARQ009.md) and silences nothing. Delete the comment.
