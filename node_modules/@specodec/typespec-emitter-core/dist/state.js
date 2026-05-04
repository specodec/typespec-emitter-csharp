/** Symbol used by $specodec decorator — shared between decorator and accessor. */
export const specodecKey = Symbol.for("specodec:model");
/**
 * Returns true if the given model has been decorated with @specodec.
 */
export function isSpecodecModel(program, model) {
    return program.stateSet(specodecKey).has(model);
}
//# sourceMappingURL=state.js.map