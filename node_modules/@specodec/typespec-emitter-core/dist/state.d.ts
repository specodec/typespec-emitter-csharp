import { Model, Program } from "@typespec/compiler";
/** Symbol used by $specodec decorator — shared between decorator and accessor. */
export declare const specodecKey: unique symbol;
/**
 * Returns true if the given model has been decorated with @specodec.
 */
export declare function isSpecodecModel(program: Program, model: Model): boolean;
//# sourceMappingURL=state.d.ts.map