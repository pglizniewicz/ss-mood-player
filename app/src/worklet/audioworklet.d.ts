/**
 * `AudioWorkletGlobalScope` declarations, which the DOM library does not carry.
 * Only what this project's processor uses is declared.
 */

declare const sampleRate: number;
declare const currentTime: number;

declare class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor(options?: object);
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
