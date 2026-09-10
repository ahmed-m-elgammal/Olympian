module.exports = {
  root: true,
  extends: [
    '@react-native',
  ],
  rules: {
    'no-shadow': 'off',
    'no-undef': 'off',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-shadow': 'off',
        'no-undef': 'off',
      },
    },
    {
      // Node-side asset tooling: the PNG encoder (CRC32), the
      // deterministic PRNG, and the Tiled flip-flag masks are all
      // inherently bitwise — banning operators there is noise.
      files: ['scripts/**/*.ts'],
      rules: {
        'no-bitwise': 'off',
      },
    },
  ],
};
