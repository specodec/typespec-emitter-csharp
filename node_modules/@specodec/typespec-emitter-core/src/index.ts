// isSpecodecModel is exported for use by emitters in TypeScript code.
// $specodec is NOT re-exported here — it is registered by TypeSpec via lib/main.tsp import.
import { isSpecodecModel } from "./state.js";
export { isSpecodecModel };

import {
  Program,
  Namespace,
  Interface,
  Model,
  ModelProperty,
  Type,
  Scalar,
  Diagnostic,
  listServices,
  navigateTypesInNamespace,
} from "@typespec/compiler";

// ─── Base emitter options (shared by all emitters) ────────────────────────────

export interface BaseEmitterOptions {
  "emitter-output-dir": string;
  "ignore-reserved-keywords"?: boolean;
}

// ─── ServiceInfo + collectServices ────────────────────────────────────────────

export interface ServiceInfo {
  namespace: Namespace;
  iface?: Interface;
  serviceName: string;
  models: Model[];
}

export function collectServices(program: Program): ServiceInfo[] {
  const services = listServices(program);
  const result: ServiceInfo[] = [];
  const pathsSeen = new Set<string>();

  function collectDirectModels(ns: Namespace): Model[] {
    const models: Model[] = [];
    const seen = new Set<string>();
    navigateTypesInNamespace(ns, {
      model: (m: Model) => {
        if (m.namespace !== ns) return;
        if (!m.name || seen.has(m.name)) return;
        if (!isSpecodecModel(program, m)) return;
        seen.add(m.name);
        models.push(m);
      },
    });
    return models;
  }

  function fakeIface(name: string, ns: Namespace): Interface {
    return { name, namespace: ns } as Interface;
  }

  function addService(ns: Namespace, serviceName: string): void {
    if (pathsSeen.has(serviceName)) return;
    pathsSeen.add(serviceName);
    const directModels = collectDirectModels(ns);
    if (directModels.length > 0) {
      result.push({ namespace: ns, iface: fakeIface(serviceName, ns), serviceName, models: directModels });
    }
  }

  function walkNamespace(ns: Namespace, path: string): void {
    addService(ns, path || "GlobalNamespace");
    for (const [, childNs] of ns.namespaces) {
      const childPath = path ? `${path}.${childNs.name}` : childNs.name;
      walkNamespace(childNs, childPath);
    }
  }

  // Phase 1: interface-based services
  for (const svc of services) {
    const ns = svc.type;
    addService(ns, ns.name || "Service");
  }

  // Phase 2: walk namespace tree from global
  const globalNs = program.getGlobalNamespaceType();
  for (const [, ns] of globalNs.namespaces) {
    walkNamespace(ns, ns.name || "");
  }

  // Phase 3: global namespace itself
  walkNamespace(globalNs, "");

  return result;
}

// ─── FieldInfo + extractFields ────────────────────────────────────────────────

export interface FieldInfo {
  name: string;
  type: Type;
  optional: boolean;
}

export function extractFields(model: Model): FieldInfo[] {
  const fields: FieldInfo[] = [];
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
export function scalarName(type: Type): string {
  if (type.kind !== "Scalar") return "";
  const s = type as Scalar;
  const known = [
    "int8", "int16", "int32", "int64",
    "uint8", "uint16", "uint32", "uint64", "integer",
    "float", "float32", "float64", "decimal",
    "boolean", "bytes", "string",
  ];
  if (known.includes(s.name)) return s.name;
  if (s.baseScalar) return scalarName(s.baseScalar);
  return s.name;
}

export function isArrayType(type: Type): boolean {
  if (type.kind !== "Model" || !(type as Model).indexer) return false;
  return ((type as Model).indexer!.key as any).name === "integer";
}

export function isRecordType(type: Type): boolean {
  if (type.kind !== "Model" || !(type as Model).indexer) return false;
  return ((type as Model).indexer!.key as any).name === "string";
}

export function isModelType(type: Type): boolean {
  return (
    type.kind === "Model" &&
    !!(type as Model).name &&
    !isArrayType(type) &&
    !isRecordType(type)
  );
}

export function arrayElementType(type: Type): Type {
  return (type as Model).indexer!.value;
}

export function recordElementType(type: Type): Type {
  return (type as Model).indexer!.value;
}

// ─── Naming convention helpers ────────────────────────────────────────────────

/**
 * PascalCase / camelCase → snake_case
 * e.g. "GlobalNamespace" → "global_namespace", "SubA" → "sub_a"
 */
export function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (_, c, i) => (i > 0 ? "_" : "") + c.toLowerCase());
}

/**
 * PascalCase / camelCase → SCREAMING_SNAKE_CASE
 * e.g. "GlobalNamespace" → "GLOBAL_NAMESPACE"
 */
export function toScreamingSnakeCase(s: string): string {
  return toSnakeCase(s).toUpperCase();
}

/**
 * snake_case → PascalCase
 * e.g. "sub_a_types" → "SubATypes", "global_namespace" → "GlobalNamespace"
 * Also handles already-PascalCase input unchanged.
 */
export function toPascalCase(s: string): string {
  return s
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Dotted namespace path → snake_case file stub
 * e.g. "MyNS.a.b" → "my_ns_a_b", "AllTypes" → "all_types"
 */
export function dottedPathToSnakeCase(path: string): string {
  return path.split(".").map(s => toSnakeCase(s)).join("_");
}

/**
 * Dotted namespace path → PascalCase stub
 * e.g. "my_ns.a.b" → "MyNsAB"
 */
export function dottedPathToPascalCase(path: string): string {
  return path.split(".").map(s => toPascalCase(toSnakeCase(s))).join("");
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

export type LangName = keyof typeof RESERVED_KEYWORDS;

export const ALL_LANGS: LangName[] = [
  "python", "dart", "kotlin", "rust", "go", "swift", "typescript",
];

export const LANG_DISPLAY_NAMES: Record<LangName, string> = {
  python: "Python",
  dart: "Dart",
  kotlin: "Kotlin",
  rust: "Rust",
  go: "Go",
  swift: "Swift",
  typescript: "TypeScript",
};

export function isReservedKeyword(name: string): boolean {
  for (const keywords of Object.values(RESERVED_KEYWORDS)) {
    if (keywords.has(name)) return true;
  }
  return false;
}

export function checkReservedKeyword(name: string): LangName[] {
  const reservedIn: LangName[] = [];
  for (const [lang, keywords] of Object.entries(RESERVED_KEYWORDS)) {
    if (keywords.has(name)) reservedIn.push(lang as LangName);
  }
  return reservedIn;
}

export function formatReservedWarning(
  fieldName: string,
  modelName: string,
  reservedIn: LangName[]
): string {
  const langNames = reservedIn.map(l => LANG_DISPLAY_NAMES[l]);
  if (langNames.length === 1) {
    return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames[0]}.`;
  } else if (langNames.length === 2) {
    return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames[0]} and ${langNames[1]}.`;
  } else {
    const last = langNames.pop();
    return `"${fieldName}" in model "${modelName}" is a reserved keyword in ${langNames.join(", ")}, and ${last}.`;
  }
}

export function formatReservedError(
  fieldName: string,
  modelName: string,
  reservedIn: LangName[]
): string {
  const langNames = reservedIn.map(l => LANG_DISPLAY_NAMES[l]);
  if (langNames.length === 1) {
    return `"${fieldName}" is a reserved keyword in ${langNames[0]}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
  } else if (langNames.length === 2) {
    return `"${fieldName}" is a reserved keyword in ${langNames[0]} and ${langNames[1]}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
  } else {
    const last = langNames.pop();
    return `"${fieldName}" is a reserved keyword in ${langNames.join(", ")}, and ${last}, and is unrecommended for single source of specodec identifier names. Add --ignore-reserved-keywords to continue.`;
  }
}

/**
 * Checks all model field names across all services for reserved keywords.
 * Reports errors to program diagnostics if found and not ignoring.
 * Returns true if execution should be aborted (errors found and not ignoring).
 */
export function checkAndReportReservedKeywords(
  program: Program,
  services: ServiceInfo[],
  ignoreReservedKeywords: boolean
): boolean {
  const errors: Diagnostic[] = [];
  for (const svc of services) {
    for (const m of svc.models) {
      if (!m.name) continue;
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

  if (errors.length === 0) return false;

  if (!ignoreReservedKeywords) {
    program.reportDiagnostics(errors);
    return true;
  }

  for (const diag of errors) {
    console.warn(`Warning: ${diag.message}`);
  }
  return false;
}
