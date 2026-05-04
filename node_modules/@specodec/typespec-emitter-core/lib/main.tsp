import "../dist/decorators.js";

using TypeSpec.Reflection;

namespace Specodec.Core;

/**
 * Mark a model to be included in specodec code generation.
 * Only models decorated with `@specodec` will be emitted.
 */
extern dec specodec(target: Model);
