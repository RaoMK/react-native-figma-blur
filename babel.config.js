/**
 * The blur model is deliberately pure TypeScript with no React Native imports, so
 * its tests run on plain Node rather than through the RN jest preset. That keeps
 * the one piece of logic that decides whether the platforms match testable in
 * isolation, and quick.
 */
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
};
