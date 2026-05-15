import { type EmitContext, emitFile, type Model, type Type } from "@typespec/compiler";
import {
  collectServices,
  type BaseEmitterOptions,
  type UnionInfo,
  type UnionVariantInfo,
  extractFields,
  scalarName,
  isArrayType,
  isRecordType,
  isModelType,
  isUnionType,
  isScalarVariant,
  arrayElementType,
  recordElementType,
  toPascalCase,
  dottedPathToSnakeCase,
  checkAndReportReservedKeywords,
  safeFieldName,
} from "@specodec/typespec-emitter-core";

export type EmitterOptions = BaseEmitterOptions;

function typeToCsharp(type: Type): string {
  if (isArrayType(type)) return `List<${typeToCsharp(arrayElementType(type)!)}>`;
  if (isRecordType(type)) return `Dictionary<string, ${typeToCsharp(recordElementType(type)!)}>`;
  const n = scalarName(type);
  if (n) {
    switch (n) {
      case "string":
        return "string";
      case "boolean":
        return "bool";
      case "int8":
        return "byte";
      case "int16":
        return "short";
      case "int32":
      case "integer":
        return "int";
      case "int64":
        return "long";
      case "uint8":
        return "byte";
      case "uint16":
        return "ushort";
      case "uint32":
        return "uint";
      case "uint64":
        return "ulong";
      case "float32":
        return "float";
      case "float64":
      case "float":
      case "decimal":
        return "double";
      case "bytes":
        return "byte[]";
    }
  }
  if (type.kind === "Enum") return "string";
  if (isUnionType(type)) return (type as any).name || "object";
  if (type.kind === "Model") return (type as Model).name || "object";
  return "object";
}

function defaultValue(type: Type): string {
  if (isArrayType(type)) return `new List<${typeToCsharp(arrayElementType(type)!)}>()`;
  if (isRecordType(type)) return `new Dictionary<string, ${typeToCsharp(recordElementType(type)!)}>()`;
  const n = scalarName(type);
  if (n) {
    switch (n) {
      case "string":
        return '""';
      case "boolean":
        return "false";
      case "int8":
      case "int16":
      case "int32":
      case "integer":
        return "0";
      case "int64":
        return "0L";
      case "uint8":
      case "uint16":
        return "0";
      case "uint32":
        return "0u";
      case "uint64":
        return "0UL";
      case "float32":
        return "0f";
      case "float64":
      case "float":
      case "decimal":
        return "0.0";
      case "bytes":
        return "Array.Empty<byte>()";
    }
  }
  if (type.kind === "Enum") return '"";';
  if (isUnionType(type)) return `new ${(type as any).name}Undefined()`;
  return "null!";
}

function isCSharpValueType(type: Type): boolean {
  const n = scalarName(type);
  return (
    n === "boolean" ||
    n === "int8" ||
    n === "int16" ||
    n === "int32" ||
    n === "int64" ||
    n === "integer" ||
    n === "uint8" ||
    n === "uint16" ||
    n === "uint32" ||
    n === "uint64" ||
    n === "float32" ||
    n === "float64" ||
    n === "float" ||
    n === "decimal"
  );
}

function writeExpr(expr: string, type: Type, w: string): string {
  if (isArrayType(type)) {
    const elem = arrayElementType(type)!;
    return [
      `${w}.BeginArray(${expr}.Count);`,
      `foreach (var item in ${expr}) { ${w}.NextElement(); ${writeExpr("item", elem, w)} }`,
      `${w}.EndArray();`,
    ].join("\n        ");
  }
  if (isRecordType(type)) {
    const elem = recordElementType(type)!;
    return [
      `${w}.BeginObject(${expr}.Count);`,
      `foreach (var kv in ${expr}) { ${w}.WriteField(kv.Key); ${writeExpr("kv.Value", elem, w)} }`,
      `${w}.EndObject();`,
    ].join("\n        ");
  }
  const n = scalarName(type);
  if (n) {
    switch (n) {
      case "string":
        return `${w}.WriteString(${expr});`;
      case "boolean":
        return `${w}.WriteBool(${expr});`;
      case "int8":
        return `${w}.WriteInt32((sbyte)${expr});`;
      case "int16":
        return `${w}.WriteInt32(${expr});`;
      case "int32":
      case "integer":
        return `${w}.WriteInt32(${expr});`;
      case "int64":
        return `${w}.WriteInt64(${expr});`;
      case "uint8":
      case "uint16":
        return `${w}.WriteUint32(${expr});`;
      case "uint32":
        return `${w}.WriteUint32(${expr});`;
      case "uint64":
        return `${w}.WriteUint64(${expr});`;
      case "float32":
        return `${w}.WriteFloat32(${expr});`;
      case "float64":
      case "float":
      case "decimal":
        return `${w}.WriteFloat64(${expr});`;
      case "bytes":
        return `${w}.WriteBytes(${expr});`;
    }
  }
  if (isUnionType(type))
    return `${(type as any).name}Methods.Write${(type as any).name}(${w}, ${expr});`;
  if (type.kind === "Model" && (type as Model).name)
    return `${(type as Model).name}Methods.Write${(type as Model).name}(${w}, ${expr});`;
  if (type.kind === "Enum") return `${w}.WriteString(${expr}.ToString());`;
  return `// TODO: unknown type`;
}

function readExpr(type: Type, r: string, optional?: boolean): string {
  if (isArrayType(type)) {
    const elem = arrayElementType(type)!;
    const csElem = typeToCsharp(elem);
    return `((Func<List<${csElem}>>)(() => { var list = new List<${csElem}>(); ${r}.BeginArray(); while (${r}.HasNextElement()) list.Add(${readExpr(elem, r)}); ${r}.EndArray(); return list; }))()`;
  }
  if (isRecordType(type)) {
    const elem = recordElementType(type)!;
    const csElem = typeToCsharp(elem);
    return `((Func<Dictionary<string, ${csElem}>>)(() => { var map = new Dictionary<string, ${csElem}>(); ${r}.BeginObject(); while (${r}.HasNextField()) { var key = ${r}.ReadFieldName(); map[key] = ${readExpr(elem, r)}; } ${r}.EndObject(); return map; }))()`;
  }
  const n = scalarName(type);
  if (n) {
    switch (n) {
      case "string":
        return `${r}.ReadString()`;
      case "boolean":
        return `${r}.ReadBool()`;
      case "int8":
        return `(byte)${r}.ReadInt32()`;
      case "int16":
        return `(short)${r}.ReadInt32()`;
      case "int32":
      case "integer":
        return `${r}.ReadInt32()`;
      case "int64":
        return `${r}.ReadInt64()`;
      case "uint8":
        return `(byte)${r}.ReadUint32()`;
      case "uint16":
        return `(ushort)${r}.ReadUint32()`;
      case "uint32":
        return `${r}.ReadUint32()`;
      case "uint64":
        return `${r}.ReadUint64()`;
      case "float32":
        return `${r}.ReadFloat32()`;
      case "float64":
      case "float":
      case "decimal":
        return `${r}.ReadFloat64()`;
      case "bytes":
        return `${r}.ReadBytes()`;
    }
  }
  if (type.kind === "Enum") return `${r}.ReadString()`;
  if (isUnionType(type)) return `${(type as any).name}Methods.${(type as any).name}Codec.Decode(${r})`;
  if (type.kind === "Model" && (type as Model).name) {
    const modelType = typeToCsharp(type);
    const decodeCall = `${(type as Model).name}Methods.${(type as Model).name}Codec.Decode(${r})`;
    if (optional)
      return `${r}.IsNull() ? ((Func<${modelType}?>)(() => { ${r}.ReadNull(); return null; }))() : ${decodeCall}`;
    return decodeCall;
  }
  return `default!`;
}

function generateModelCode(m: Model, _pkg: string): string {
  const fields = extractFields(m);
  const optionalFields = fields.filter((f) => f.optional);
  const requiredCount = fields.filter((f) => !f.optional).length;
  const recordFields = [...fields.filter((f) => !f.optional), ...fields.filter((f) => f.optional)];
  const lines: string[] = [];

  if (fields.length === 0) {
    lines.push(`public record ${m.name};`);
  } else {
    lines.push(`public record ${m.name}(`);
    for (let i = 0; i < recordFields.length; i++) {
      const f = recordFields[i];
      const comma = i < recordFields.length - 1 ? "," : "";
      if (f.optional) {
        lines.push(`    ${typeToCsharp(f.type)}? ${toPascalCase(f.name)} = null${comma}`);
      } else {
        lines.push(`    ${typeToCsharp(f.type)} ${toPascalCase(f.name)}${comma}`);
      }
    }
    lines.push(`);`);
  }

  lines.push(``);
  lines.push(`public static class ${m.name}Methods {`);
  lines.push(`public static void Write${m.name}(SpecWriter w, ${m.name} obj) {`);
  if (optionalFields.length > 0) {
    lines.push(`    var fieldCount = ${requiredCount};`);
    for (const f of optionalFields) {
      const fname = safeFieldName("csharp", toPascalCase(f.name));
      lines.push(`    if (obj.${fname} != null) fieldCount++;`);
    }
    lines.push(`    w.BeginObject(fieldCount);`);
  } else {
    lines.push(`    w.BeginObject(${fields.length});`);
  }
  for (const f of fields) {
    const fname = toPascalCase(f.name);
    if (f.optional) {
      const valExpr = isCSharpValueType(f.type) ? `obj.${fname}.Value` : `obj.${fname}`;
      lines.push(`    if (obj.${fname} != null) { w.WriteField("${f.name}"); ${writeExpr(valExpr, f.type, "w")} }`);
    } else {
      lines.push(`    w.WriteField("${f.name}"); ${writeExpr(`obj.${fname}`, f.type, "w")}`);
    }
  }
  lines.push(`    w.EndObject();`);
  lines.push(`}`);

  lines.push(``);
  lines.push(`public static readonly SpecCodec<${m.name}> ${m.name}Codec = new(`);
  lines.push(`    Encode: (w, obj) => Write${m.name}(w, obj),`);
  lines.push(`    Decode: r => {`);
  for (const f of fields) {
    const fname = toPascalCase(f.name);
    if (f.optional || isModelType(f.type)) {
      lines.push(`        ${typeToCsharp(f.type)}? _${fname} = null;`);
    } else {
      lines.push(`        ${typeToCsharp(f.type)} _${fname} = ${defaultValue(f.type)};`);
    }
  }
  lines.push(`        r.BeginObject();`);
  lines.push(`        while (r.HasNextField()) {`);
  lines.push(`            switch (r.ReadFieldName()) {`);
  for (const f of fields) {
    const fname = toPascalCase(f.name);
    if (f.optional || isModelType(f.type) || isArrayType(f.type) || isRecordType(f.type)) {
      lines.push(`                case "${f.name}": _${fname} = ${readExpr(f.type, "r", f.optional)}; break;`);
    } else {
      lines.push(`                case "${f.name}": _${fname} = ${readExpr(f.type, "r")}; break;`);
    }
  }
  lines.push(`                default: r.Skip(); break;`);
  lines.push(`            }`);
  lines.push(`        }`);
  lines.push(`        r.EndObject();`);
  const ctorArgs = recordFields
    .map((f) => {
      const fname = toPascalCase(f.name);
      if (!f.optional && isModelType(f.type)) return `${fname}: _${fname}!`;
      return `${fname}: _${fname}`;
    })
    .join(", ");
  lines.push(`        return new ${m.name}(${ctorArgs});`);
  lines.push(`    }`);
  lines.push(`);`);
  lines.push(`} // ${m.name}Methods`);

  return lines.join("\n");
}

function generateUnionCode(u: UnionInfo, L: string[]): void {
  const unionName = u.name;

  L.push(`public abstract record ${unionName};`);
  L.push(``);
  for (const v of u.variants) {
    const pascalName = toPascalCase(v.name);
    const csType = typeToCsharp(v.type);
    L.push(`public record ${unionName}${pascalName}(${csType} Value) : ${unionName};`);
  }
  L.push(`public record ${unionName}Undefined() : ${unionName};`);
  L.push(``);

  L.push(`public static class ${unionName}Methods {`);
  L.push(`public static void Write${unionName}(SpecWriter w, ${unionName} obj) {`);
  L.push(`    w.BeginObject(1);`);
  L.push(`    switch (obj) {`);
  for (const v of u.variants) {
    const pascalName = toPascalCase(v.name);
    L.push(`        case ${unionName}${pascalName} v: w.WriteField("${v.name}"); ${writeExpr("v.Value", v.type, "w")} break;`);
  }
  L.push(`        _ => throw new Exception("cannot encode Undefined for ${unionName}")`);
  L.push(`    }`);
  L.push(`    w.EndObject();`);
  L.push(`}`);

  L.push(``);
  L.push(`public static ${unionName} Decode${unionName}(SpecReader r) {`);
  L.push(`    r.BeginObject();`);
  L.push(`    if (!r.HasNextField()) { r.EndObject(); throw new Exception("empty union"); }`);
  L.push(`    var field = r.ReadFieldName();`);
  L.push(`    ${unionName} result = field switch {`);
  for (const v of u.variants) {
    L.push(`        "${v.name}" => new ${unionName}${toPascalCase(v.name)}(${readExpr(v.type, "r")}),`);
  }
  L.push(`        _ => throw new Exception($"unknown variant {field}")`);
  L.push(`    };`);
  L.push(`    while (r.HasNextField()) { r.ReadFieldName(); r.Skip(); }`);
  L.push(`    r.EndObject();`);
  L.push(`    return result;`);
  L.push(`}`);

  L.push(``);
  L.push(`public static readonly SpecCodec<${unionName}> ${unionName}Codec = new(Write${unionName}, Decode${unionName});`);
  L.push(`} // ${unionName}Methods`);
}


export async function $onEmit(context: EmitContext<EmitterOptions>) {
  const program = context.program;
  const outputDir = context.emitterOutputDir;
  const ignoreReservedKeywords = context.options["ignore-reserved-keywords"] ?? false;
  const services = collectServices(program);

  if (checkAndReportReservedKeywords(program, services, ignoreReservedKeywords)) return;

  for (const svc of services) {
    const pkg = svc.serviceName || "globalnamespace";
    const lines: string[] = [];
    lines.push("// Generated by @specodec/typespec-emitter-csharp. DO NOT EDIT.");
    if (svc.namespace.name && svc.namespace.name !== "global") {
      lines.push(`namespace ${pkg};`);
    }
    lines.push(``);
    lines.push(`using Specodec;`);
    lines.push(`using System;`);
    lines.push(`using System.Collections.Generic;`);
    lines.push(``);
    for (const m of svc.models) {
      if (!m.name) continue;
      lines.push(generateModelCode(m, pkg));
      lines.push(``);
    }
    for (const u of svc.unions) {
      generateUnionCode(u, lines);
      lines.push(``);
    }
    const fileName = `${dottedPathToSnakeCase(svc.serviceName)}_types.cs`;
    await emitFile(program, { path: `${outputDir}/${fileName}`, content: lines.join("\n") });
  }
}
