// isSpecodecModel is exported for use by emitters in TypeScript code.
// $specodec is NOT re-exported here — it is registered by TypeSpec via lib/main.tsp import.
import { isSpecodecModel } from "./state.js";
export { isSpecodecModel };
import { listServices, navigateTypesInNamespace, } from "@typespec/compiler";
export function collectServices(program) {
    const services = listServices(program);
    const result = [];
    const globalSeen = new Set();
    function collectFromNs(ns, iface) {
        const models = [];
        navigateTypesInNamespace(ns, {
            model: (m) => {
                if (m.name && !globalSeen.has(m.name) && isSpecodecModel(program, m)) {
                    models.push(m);
                    globalSeen.add(m.name);
                }
            },
        });
        if (models.length > 0) {
            // Use "GlobalNamespace" for global namespace (empty name or "global")
            const serviceName = iface?.name || (ns.name && ns.name !== "global" ? ns.name : "GlobalNamespace");
            result.push({
                namespace: ns,
                iface: iface || { name: serviceName, namespace: ns },
                serviceName,
                models,
            });
        }
    }
    for (const svc of services)
        collectFromNs(svc.type);
    const globalNs = program.getGlobalNamespaceType();
    for (const [, ns] of globalNs.namespaces)
        collectFromNs(ns);
    collectFromNs(globalNs);
    return result;
}
export function extractFields(model) {
    const fields = [];
    for (const [name, prop] of model.properties) {
        fields.push({ name, type: prop.type, optional: prop.optional ?? false });
    }
    return fields;
}
// ─── Type inspection helpers ──────────────────────────────────────────────────
/**
 * Returns the scalar name for a type. Supports baseScalar recursion for
 * user-defined scalar subtypes (e.g. `scalar MyId extends string`).
 */
export function scalarName(type) {
    if (type.kind !== "Scalar")
        return "";
    const s = type;
    const known = [
        "int8", "int16", "int32", "int64",
        "uint8", "uint16", "uint32", "uint64", "integer",
        "float", "float32", "float64", "decimal",
        "boolean", "bytes", "string",
    ];
    if (known.includes(s.name))
        return s.name;
    if (s.baseScalar)
        return scalarName(s.baseScalar);
    return s.name;
}
export function isArrayType(type) {
    if (type.kind !== "Model" || !type.indexer)
        return false;
    return type.indexer.key.name === "integer";
}
export function isRecordType(type) {
    if (type.kind !== "Model" || !type.indexer)
        return false;
    return type.indexer.key.name === "string";
}
export function isModelType(type) {
    return (type.kind === "Model" &&
        !!type.name &&
        !isArrayType(type) &&
        !isRecordType(type));
}
export function arrayElementType(type) {
    return type.indexer.value;
}
export function recordElementType(type) {
    return type.indexer.value;
}
// ─── Naming convention helpers ────────────────────────────────────────────────
/**
 * PascalCase / camelCase → snake_case
 * e.g. "GlobalNamespace" → "global_namespace", "SubA" → "sub_a"
 */
export function toSnakeCase(s) {
    return s
        .replace(/([A-Z])/g, (_, c, i) => (i > 0 ? "_" : "") + c.toLowerCase());
}
/**
 * PascalCase / camelCase → SCREAMING_SNAKE_CASE
 * e.g. "GlobalNamespace" → "GLOBAL_NAMESPACE"
 */
export function toScreamingSnakeCase(s) {
    return toSnakeCase(s).toUpperCase();
}
/**
 * snake_case → PascalCase
 * e.g. "sub_a_types" → "SubATypes", "global_namespace" → "GlobalNamespace"
 * Also handles already-PascalCase input unchanged.
 */
export function toPascalCase(s) {
    return s
        .split("_")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}
// ─── Reserved keyword checking ────────────────────────────────────────────────
export const RESERVED_KEYWORDS = {
    python: new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await",
        "break", "class", "continue", "def", "del", "elif", "else", "except",
        "finally", "for", "from", "global", "if", "import", "in", "is",
        "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
        "while", "with", "yield",
    ]),
    dart: new Set([
        "abstract", "as", "assert", "async", "await", "break", "case", "catch",
        "class", "const", "continue", "covariant", "default", "deferred", "do",
        "dynamic", "else", "enum", "export", "extends", "extension", "external",
        "factory", "false", "final", "finally", "for", "Function", "get", "hide",
        "if", "implements", "import", "in", "interface", "is", "late", "library",
        "mixin", "new", "null", "on", "operator", "part", "required", "rethrow",
        "return", "set", "show", "static", "super", "switch", "sync", "this",
        "throw", "true", "try", "typedef", "var", "void", "while", "with", "yield",
    ]),
    kotlin: new Set([
        "abstract", "actual", "annotation", "as", "as?", "break", "by", "catch",
        "class", "companion", "const", "constructor", "continue", "crossinline",
        "data", "delegate", "do", "dynamic", "else", "enum", "expect", "external",
        "field", "file", "final", "finally", "for", "fun", "get", "if", "import",
        "in", "infix", "init", "inline", "inner", "interface", "internal", "is",
        "it", "lateinit", "lazy", "noinline", "object", "open", "operator", "out",
        "override", "package", "param", "private", "property", "protected", "public",
        "receiver", "reified", "return", "sealed", "set", "setparam", "suspend",
        "tailrec", "this", "throw", "try", "typealias", "typeof", "val", "var",
        "vararg", "when", "where", "while",
    ]),
    rust: new Set([
        "as", "async", "await", "break", "const", "continue", "crate", "dyn",
        "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in",
        "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
        "self", "Self", "static", "struct", "super", "trait", "true", "type",
        "unsafe", "use", "where", "while",
        "abstract", "become", "box", "do", "final", "macro", "override", "priv",
        "typeof", "unsized", "virtual", "yield",
    ]),
    go: new Set([
        "break", "case", "chan", "const", "continue", "default", "defer", "else",
        "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
        "map", "package", "range", "return", "select", "struct", "switch", "type",
        "var",
        "bool", "byte", "complex64", "complex128", "error", "float32", "float64",
        "int", "int8", "int16", "int32", "int64", "rune", "string", "uint",
        "uint8", "uint16", "uint32", "uint64", "uintptr",
        "true", "false", "nil", "iota",
        "append", "cap", "close", "complex", "copy", "delete", "imag", "len",
        "make", "new", "panic", "print", "println", "real", "recover",
    ]),
    swift: new Set([
        "associatedtype", "as", "break", "case", "catch", "class", "continue",
        "convenience", "default", "defer", "deinit", "didSet", "do", "dynamic",
        "else", "enum", "extension", "fallthrough", "false", "fileprivate", "final",
        "for", "func", "get", "guard", "if", "import", "in", "infix", "init",
        "inout", "internal", "is", "lazy", "left", "let", "mutating", "nil",
        "none", "nonmutating", "open", "operator", "optional", "override", "postfix",
        "precedence", "prefix", "private", "protocol", "public", "repeat", "required",
        "rethrows", "return", "right", "self", "Self", "set", "some", "static",
        "struct", "subscript", "super", "switch", "throw", "throws", "true", "try",
        "typealias", "unowned", "var", "weak", "where", "while", "willSet",
    ]),
    typescript: new Set([
        "break", "case", "catch", "class", "const", "continue", "debugger",
        "default", "delete", "do", "else", "enum", "export", "extends", "false",
        "finally", "for", "function", "if", "import", "in", "instanceof", "new",
        "null", "return", "super", "switch", "this", "throw", "true", "try",
        "typeof", "var", "void", "while", "with",
        "as", "async", "await", "constructor", "declare", "from", "get", "infer",
        "is", "keyof", "let", "module", "namespace", "never", "of", "package",
        "private", "protected", "public", "readonly", "require", "set", "static",
        "symbol", "type", "unique", "unknown", "yield",
    ]),
};
export const ALL_LANGS = [
    "python", "dart", "kotlin", "rust", "go", "swift", "typescript",
];
export const LANG_DISPLAY_NAMES = {
    python: "Python",
    dart: "Dart",
    kotlin: "Kotlin",
    rust: "Rust",
    go: "Go",
    swift: "Swift",
    typescript: "TypeScript",
};
export function isReservedKeyword(name) {
    for (const keywords of Object.values(RESERVED_KEYWORDS)) {
        if (keywords.has(name))
            return true;
    }
    return false;
}
export function checkReservedKeyword(name) {
    const reservedIn = [];
    for (const [lang, keywords] of Object.entries(RESERVED_KEYWORDS)) {
        if (keywords.has(name))
            reservedIn.push(lang);
    }
    return reservedIn;
}
export function formatReservedWarning(fieldName, modelName, reservedIn) {
    const langNames = reservedIn.map(l => LANG_DISPLAY_NAMES[l]);
    if (langNames.length === 1) {
        return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames[0]}.`;
    }
    else if (langNames.length === 2) {
        return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames[0]} and ${langNames[1]}.`;
    }
    else {
        const last = langNames.pop();
        return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames.join(", ")}, and ${last}.`;
    }
}
export function formatReservedError(fieldName, modelName, reservedIn) {
    const langNames = reservedIn.map(l => LANG_DISPLAY_NAMES[l]);
    if (langNames.length === 1) {
        return `"${fieldName}" is a reserved keyword in ${langNames[0]}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
    }
    else if (langNames.length === 2) {
        return `"${fieldName}" is a reserved keyword in ${langNames[0]} and ${langNames[1]}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
    }
    else {
        const last = langNames.pop();
        return `"${fieldName}" is a reserved keyword in ${langNames.join(", ")}, and ${last}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
    }
}
/**
 * Checks all model field names across all services for reserved keywords.
 * Reports errors to program diagnostics if found and not ignoring.
 * Returns true if execution should be aborted (errors found and not ignoring).
 */
export function checkAndReportReservedKeywords(program, services, ignoreReservedKeywords) {
    const errors = [];
    for (const svc of services) {
        for (const m of svc.models) {
            if (!m.name)
                continue;
            for (const [fieldName, prop] of m.properties) {
                const reservedIn = checkReservedKeyword(fieldName);
                if (reservedIn.length > 0) {
                    errors.push({
                        severity: "error",
                        code: "reserved-keyword",
                        message: formatReservedError(fieldName, m.name, reservedIn),
                        target: prop,
                    });
                }
            }
        }
    }
    if (errors.length === 0)
        return false;
    if (!ignoreReservedKeywords) {
        program.reportDiagnostics(errors);
        return true;
    }
    for (const diag of errors) {
        console.warn(`Warning: ${diag.message}`);
    }
    return false;
}
//# sourceMappingURL=index.js.map