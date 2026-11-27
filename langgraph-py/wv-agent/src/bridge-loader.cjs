'use strict';

/**
 * Webpack 4 & 5 pre-loader that instruments dev-mode JSBridge SDKs
 * (@meetyou/toolbox/lib/jssdk, meetyou.jssdk, meetyou.bridge).
 */
const { instrumentBridgeSdkSource } = require('./bridge-instrument.cjs');

module.exports = function wvAgentBridgeLoader(source) {
  if (this && typeof this.cacheable === 'function') {
    this.cacheable();
  }
  const resourcePath = (this && this.resourcePath) || '';
  const transformed = instrumentBridgeSdkSource(resourcePath, source);
  return transformed !== null ? transformed : source;
};
