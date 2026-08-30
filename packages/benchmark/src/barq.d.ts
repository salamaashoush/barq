/**
 * Compiler mode, for the tier-2 apps.
 *
 * They are compiled by barq like any application, so `class={() => …}` and a
 * `<For>` written with `each`/`children` are what the compiler lowers. Without
 * this the JSX types demand the un-compiled spellings and every one of them
 * reads as an error.
 */
declare global {
  namespace Barq {
    interface Config {
      COMPILER_MODE: true;
    }
  }
}

export {};
