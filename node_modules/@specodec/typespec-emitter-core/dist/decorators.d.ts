import { DecoratorContext, Model } from "@typespec/compiler";
/** Tell TypeSpec to register decorators in this file under the Specodec.Core namespace. */
export declare const namespace = "Specodec.Core";
/**
 * $specodec — marks a model for specodec code generation.
 * Loaded by TypeSpec via lib/main.tsp only.
 */
export declare function $specodec(context: DecoratorContext, target: Model): void;
//# sourceMappingURL=decorators.d.ts.map