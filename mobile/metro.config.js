const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Metro does not follow symlinks out of the project by default, so point it at the
// workspace: watch the whole tree, and resolve modules from both node_modules dirs.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Without this, a hoisted duplicate of React could be resolved from a parent dir.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
