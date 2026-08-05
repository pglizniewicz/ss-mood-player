/**
 * Hand-written declarations for the vendored single-file `lit-html.js`.
 *
 * The published lit-html type definitions are spread across the package's module graph and
 * reference files this project does not vendor, so only the surface actually used here is
 * declared. Extend it when a new lit-html export is adopted.
 */

export type TemplateResult = {
    _$litType$: unknown;
    strings: TemplateStringsArray;
    values: unknown[];
};

export declare const html: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult;
export declare const svg: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult;
export declare const nothing: unique symbol;
export declare const noChange: unique symbol;
export declare const render: (
    value: unknown,
    container: HTMLElement | DocumentFragment,
    options?: object
) => object;
