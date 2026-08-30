/**
 * Compiler mode: control-flow props (`when`, `each`) accept raw values, because
 * the compiler wraps them in thunks.
 */
declare global {
  namespace Barq {
    interface Config {
      COMPILER_MODE: true;
    }
  }
}

export {};
