import { EmitContext } from "@typespec/compiler";
import { BaseEmitterOptions } from "@specodec/typespec-emitter-core";
export type EmitterOptions = BaseEmitterOptions;
export declare function $onEmit(context: EmitContext<EmitterOptions>): Promise<void>;
