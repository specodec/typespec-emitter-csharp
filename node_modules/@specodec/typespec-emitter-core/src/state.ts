import { Model, Program } from "@typespec/compiler";

/** Symbol used by $specodec decorator — shared between decorator and accessor. */
export const specodecKey = Symbol.for("specodec:model");

/**
 * Returns true if the given model has been decorated with @specodec.
 */
export function isSpecodecModel(program: Program, model: Model): boolean {
  return program.stateSet(specodecKey).has(model);
}
