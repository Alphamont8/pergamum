declare module '@citation-js/core' {
  export class Cite {
    constructor(data?: unknown)
    format(
      type: 'bibliography' | 'citation',
      options?: Record<string, unknown>,
    ): string | Array<[string, string]> | Array<unknown>
  }

  export const plugins: {
    config: {
      get: (name: string) => unknown
    }
  }
}

declare module '@citation-js/plugin-csl' {
  const plugin: unknown
  export default plugin
}
