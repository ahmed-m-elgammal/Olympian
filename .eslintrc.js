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
  ],
};
