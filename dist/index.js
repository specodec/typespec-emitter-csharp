import { emitFile, } from "@typespec/compiler";
import { collectServices, extractFields, scalarName, isArrayType, isRecordType, isModelType, arrayElementType, recordElementType, toPascalCase, toSnakeCase, checkAndReportReservedKeywords, } from "@specodec/typespec-emitter-core";
function typeToCsharp(type) {
    if (isArrayType(type))
        return `List<${typeToCsharp(arrayElementType(type))}>`;
    if (isRecordType(type))
        return `Dictionary<string, ${typeToCsharp(recordElementType(type))}>`;
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return "string";
            case "boolean": return "bool";
            case "int8": return "byte";
            case "int16": return "short";
            case "int32":
            case "integer": return "int";
            case "int64": return "long";
            case "uint8": return "byte";
            case "uint16": return "ushort";
            case "uint32": return "uint";
            case "uint64": return "ulong";
            case "float32": return "float";
            case "float64":
            case "float":
            case "decimal": return "double";
            case "bytes": return "byte[]";
        }
    }
    if (type.kind === "Model")
        return type.name || "object";
    return "object";
}
function defaultValue(type) {
    if (isArrayType(type))
        return `new List<${typeToCsharp(arrayElementType(type))}>()`;
    if (isRecordType(type))
        return `new Dictionary<string, ${typeToCsharp(recordElementType(type))}>()`;
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return '""';
            case "boolean": return "false";
            case "int8":
            case "int16":
            case "int32":
            case "integer": return "0";
            case "int64": return "0L";
            case "uint8":
            case "uint16": return "0";
            case "uint32": return "0u";
            case "uint64": return "0UL";
            case "float32": return "0f";
            case "float64":
            case "float":
            case "decimal": return "0.0";
            case "bytes": return "Array.Empty<byte>()";
        }
    }
    return "null!";
}
function isCSharpValueType(type) {
    const n = scalarName(type);
    return n === "boolean"
        || n === "int8" || n === "int16" || n === "int32" || n === "int64" || n === "integer"
        || n === "uint8" || n === "uint16" || n === "uint32" || n === "uint64"
        || n === "float32" || n === "float64" || n === "float" || n === "decimal";
}
function writeExpr(expr, type, w) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        return [
            `${w}.BeginArray(${expr}.Count);`,
            `foreach (var _e in ${expr}) { ${w}.NextElement(); ${writeExpr("_e", elem, w)} }`,
            `${w}.EndArray();`,
        ].join("\n        ");
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        return [
            `${w}.BeginObject(${expr}.Count);`,
            `foreach (var _kv in ${expr}) { ${w}.WriteField(_kv.Key); ${writeExpr("_kv.Value", elem, w)} }`,
            `${w}.EndObject();`,
        ].join("\n        ");
    }
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return `${w}.WriteString(${expr});`;
            case "boolean": return `${w}.WriteBool(${expr});`;
            case "int8":
            case "int16": return `${w}.WriteInt32(${expr});`;
            case "int32":
            case "integer": return `${w}.WriteInt32(${expr});`;
            case "int64": return `${w}.WriteInt64(${expr});`;
            case "uint8":
            case "uint16": return `${w}.WriteUint32(${expr});`;
            case "uint32": return `${w}.WriteUint32(${expr});`;
            case "uint64": return `${w}.WriteUint64(${expr});`;
            case "float32": return `${w}.WriteFloat32(${expr});`;
            case "float64":
            case "float":
            case "decimal": return `${w}.WriteFloat64(${expr});`;
            case "bytes": return `${w}.WriteBytes(${expr});`;
        }
    }
    if (type.kind === "Model" && type.name)
        return `${type.name}Methods.Write${type.name}(${w}, ${expr});`;
    return `// TODO: unknown type`;
}
function readExpr(type, r, optional) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        const csElem = typeToCsharp(elem);
        return `((Func<List<${csElem}>>)(() => { var _list = new List<${csElem}>(); ${r}.BeginArray(); while (${r}.HasNextElement()) _list.Add(${readExpr(elem, r)}); ${r}.EndArray(); return _list; }))()`;
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        const csElem = typeToCsharp(elem);
        return `((Func<Dictionary<string, ${csElem}>>)(() => { var _map = new Dictionary<string, ${csElem}>(); ${r}.BeginObject(); while (${r}.HasNextField()) { var _k = ${r}.ReadFieldName(); _map[_k] = ${readExpr(elem, r)}; } ${r}.EndObject(); return _map; }))()`;
    }
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string": return `${r}.ReadString()`;
            case "boolean": return `${r}.ReadBool()`;
            case "int8": return `(byte)${r}.ReadInt32()`;
            case "int16": return `(short)${r}.ReadInt32()`;
            case "int32":
            case "integer": return `${r}.ReadInt32()`;
            case "int64": return `${r}.ReadInt64()`;
            case "uint8": return `(byte)${r}.ReadUint32()`;
            case "uint16": return `(ushort)${r}.ReadUint32()`;
            case "uint32": return `${r}.ReadUint32()`;
            case "uint64": return `${r}.ReadUint64()`;
            case "float32": return `${r}.ReadFloat32()`;
            case "float64":
            case "float":
            case "decimal": return `${r}.ReadFloat64()`;
            case "bytes": return `${r}.ReadBytes()`;
        }
    }
    if (type.kind === "Model" && type.name) {
        const modelType = typeToCsharp(type);
        const decodeCall = `${type.name}Methods.${type.name}Codec.Decode(${r})`;
        if (optional)
            return `${r}.IsNull() ? ((Func<${modelType}?>)(() => { ${r}.ReadNull(); return null; }))() : ${decodeCall}`;
        return decodeCall;
    }
    return `default!`;
}
function generateModelCode(m, pkg) {
    const fields = extractFields(m);
    const optionalFields = fields.filter(f => f.optional);
    const requiredFields = fields.filter(f => !f.optional);
    const orderedFields = [...requiredFields, ...optionalFields];
    const lines = [];
    if (fields.length === 0) {
        lines.push(`public record ${m.name};`);
    }
    else {
        lines.push(`public record ${m.name}(`);
        for (let i = 0; i < orderedFields.length; i++) {
            const f = orderedFields[i];
            const comma = i < orderedFields.length - 1 ? "," : "";
            if (f.optional) {
                lines.push(`    ${typeToCsharp(f.type)}? ${toPascalCase(f.name)} = null${comma}`);
            }
            else {
                lines.push(`    ${typeToCsharp(f.type)} ${toPascalCase(f.name)}${comma}`);
            }
        }
        lines.push(`);`);
    }
    lines.push(``);
    lines.push(`public static class ${m.name}Methods {`);
    lines.push(`public static void Write${m.name}(SpecWriter w, ${m.name} obj) {`);
    if (optionalFields.length > 0) {
        lines.push(`    var _n = ${requiredFields.length};`);
        for (const f of optionalFields) {
            const fname = toPascalCase(f.name);
            lines.push(`    if (obj.${fname} != null) _n++;`);
        }
        lines.push(`    w.BeginObject(_n);`);
    }
    else {
        lines.push(`    w.BeginObject(${fields.length});`);
    }
    for (const f of orderedFields) {
        const fname = toPascalCase(f.name);
        if (f.optional) {
            const valExpr = isCSharpValueType(f.type) ? `obj.${fname}.Value` : `obj.${fname}`;
            lines.push(`    if (obj.${fname} != null) { w.WriteField("${f.name}"); ${writeExpr(valExpr, f.type, "w")} }`);
        }
        else {
            lines.push(`    w.WriteField("${f.name}"); ${writeExpr(`obj.${fname}`, f.type, "w")}`);
        }
    }
    lines.push(`    w.EndObject();`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`public static readonly SpecCodec<${m.name}> ${m.name}Codec = new(`);
    lines.push(`    Encode: (w, obj) => Write${m.name}(w, obj),`);
    lines.push(`    Decode: r => {`);
    for (const f of orderedFields) {
        const fname = toPascalCase(f.name);
        if (f.optional || isModelType(f.type)) {
            lines.push(`        ${typeToCsharp(f.type)}? _${fname} = null;`);
        }
        else {
            lines.push(`        ${typeToCsharp(f.type)} _${fname} = ${defaultValue(f.type)};`);
        }
    }
    lines.push(`        r.BeginObject();`);
    lines.push(`        while (r.HasNextField()) {`);
    lines.push(`            switch (r.ReadFieldName()) {`);
    for (const f of orderedFields) {
        const fname = toPascalCase(f.name);
        if (f.optional || isModelType(f.type) || isArrayType(f.type) || isRecordType(f.type)) {
            lines.push(`                case "${f.name}": _${fname} = ${readExpr(f.type, "r", f.optional)}; break;`);
        }
        else {
            lines.push(`                case "${f.name}": _${fname} = ${readExpr(f.type, "r")}; break;`);
        }
    }
    lines.push(`                default: r.Skip(); break;`);
    lines.push(`            }`);
    lines.push(`        }`);
    lines.push(`        r.EndObject();`);
    const ctorArgs = orderedFields.map(f => {
        const fname = toPascalCase(f.name);
        if (!f.optional && isModelType(f.type))
            return `${fname}: _${fname}!`;
        return `${fname}: _${fname}`;
    }).join(", ");
    lines.push(`        return new ${m.name}(${ctorArgs});`);
    lines.push(`    }`);
    lines.push(`);`);
    lines.push(`} // ${m.name}Methods`);
    return lines.join("\n");
}
export async function $onEmit(context) {
    const program = context.program;
    const outputDir = context.emitterOutputDir;
    const ignoreReservedKeywords = context.options["ignore-reserved-keywords"] ?? false;
    const services = collectServices(program);
    if (checkAndReportReservedKeywords(program, services, ignoreReservedKeywords))
        return;
    for (const svc of services) {
        const pkg = toPascalCase(toSnakeCase(svc.namespace.name || "globalnamespace").replace(/_/g, "").toLowerCase());
        const lines = [];
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
            if (!m.name)
                continue;
            lines.push(generateModelCode(m, pkg));
            lines.push(``);
        }
        const fileName = `${toPascalCase(toSnakeCase(svc.serviceName))}Types.cs`;
        await emitFile(program, { path: `${outputDir}/${fileName}`, content: lines.join("\n") });
    }
}
