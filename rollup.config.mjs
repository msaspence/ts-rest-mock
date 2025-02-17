import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  external: [/node_modules/],
  output: [
    {
      file: 'dist/index.esm.js',
      format: 'esm',
    },
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
    },
  ],
  plugins: [
    resolve({
      extensions: ['.js', '.ts'],
    }),
    commonjs({}),
    typescript({
      tsconfig: './tsconfig.lib.json',
    }),
    terser(),
  ],
};
