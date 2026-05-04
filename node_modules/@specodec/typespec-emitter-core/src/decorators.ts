import { DecoratorContext, Model } from "@typespec/compiler";
import { specodecKey } from "./state.js";

/** Tell TypeSpec to register decorators in this file under the Specodec.Core namespace. */
export const namespace = "Specodec.Core";

/**
 * $specodec — marks a model for specodec code generation.
 * Loaded by TypeSpec via lib/main.tsp only.
 */
export function $specodec(context: DecoratorContext, target: Model): void {
  context.program.stateSet(specodecKey).add(target);
}
