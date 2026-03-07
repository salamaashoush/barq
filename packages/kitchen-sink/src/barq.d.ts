/**
 * Enable Barq compiler mode for permissive types.
 *
 * This allows control flow props (when, each) to accept raw values
 * since the compiler will automatically wrap them in thunks.
 */
declare global {
  namespace Barq {
    interface Config {
      COMPILER_MODE: true;
    }
  }
}

export {};
