/** The dictionaries' key lists, one per half, made by `plugins/localeKeys.ts`. */
declare module "virtual:locale-keys-now" {
  export const shape: [string, string[]][];
  export function rebuild(shape: [string, string[]][], values: unknown[]): Record<string, Record<string, unknown>>;
}
