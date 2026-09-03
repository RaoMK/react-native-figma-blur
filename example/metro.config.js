const path = require('path');
const escape = require('escape-string-regexp');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

/**
 * The library is consumed from source through a symlink, which means Metro can
 * see two copies of every peer dependency: the example's, and the one the repo
 * root installs to build and typecheck with.
 *
 * Redirecting with `extraNodeModules` alone is not enough — that is only a
 * fallback for modules Metro cannot otherwise resolve, and the root's copy
 * resolves perfectly well. The result is two Reacts in one bundle, which surfaces
 * as "Cannot read property 'useMemo' of null" the moment a hook runs inside the
 * library: the component is registered with one React's dispatcher and rendered
 * by the other.
 *
 * So the root copies are blocked outright, and every peer dependency is pinned to
 * the example's own node_modules.
 */
const peerDeps = Object.keys(pkg.peerDependencies ?? {});

const config = {
  watchFolders: [root],
  resolver: {
    blockList: peerDeps.map(
      name =>
        new RegExp(`^${escape(path.join(root, 'node_modules', name))}\\${path.sep}.*$`)
    ),
    extraNodeModules: Object.fromEntries(
      peerDeps.map(name => [name, path.join(__dirname, 'node_modules', name)])
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
