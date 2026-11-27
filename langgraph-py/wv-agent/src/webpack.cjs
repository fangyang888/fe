'use strict';

const path = require('path');
const { BRIDGE_SDK_FILTER } = require('./bridge-instrument.cjs');

/**
 * Webpack 4 & 5 dev-only plugin (Node 14+ compatible).
 * Instruments @meetyou/toolbox/lib/jssdk, meetyou.jssdk, and meetyou.bridge in development
 * so HarmonyOS read-only WebViews and locked meetyou.bridge instances still report full traces.
 * Automatically no-ops when mode === 'production' or NODE_ENV === 'production'.
 */
function wvAgentWebpackPlugin(options) {
  const opts = options || {};
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const loaderPath = path.join(__dirname, 'bridge-loader.cjs');

  return {
    name: 'wv-agent-webpack-plugin',
    apply: function (compiler) {
      if (onlyWhenEnv && process.env.WV_AGENT !== '1') return;
      if (!compiler || !compiler.options) return;
      if (compiler.options.mode === 'production' || process.env.NODE_ENV === 'production') {
        return;
      }
      compiler.options.module = compiler.options.module || {};
      compiler.options.module.rules = compiler.options.module.rules || [];
      compiler.options.module.rules.push({
        test: BRIDGE_SDK_FILTER,
        enforce: 'pre',
        use: [{ loader: loaderPath }],
      });
    },
  };
}

module.exports = wvAgentWebpackPlugin;
module.exports.wvAgentWebpackPlugin = wvAgentWebpackPlugin;
