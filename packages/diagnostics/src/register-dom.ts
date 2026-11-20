// Its own module so the registration runs before `@barqjs/core` evaluates:
// core reads `typeof document` once, at module scope.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
