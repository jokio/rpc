import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Declarations are emitted separately by `tsc` (see build script).
  // TypeScript 7's native compiler doesn't expose the legacy JS compiler
  // API that tsup's dts bundler (rollup-plugin-dts) relies on.
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: [
    'express',
    'zod',
    '@modelcontextprotocol/server',
    '@modelcontextprotocol/node',
  ],
})
