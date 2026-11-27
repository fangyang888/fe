'use strict';

/**
 * Shared dev-only JSBridge SDK instrumentation (Node 14+ CommonJS, ES5 output).
 * Covers:
 *  1) @meetyou/toolbox/lib/jssdk/index.js
 *  2) meetyou.jssdk/lib/sdk.js
 *  3) meetyou.bridge/lib/index.js
 *
 * Ensures page-originated JSBridge calls are captured even on read-only HarmonyOS ArkWeb
 * bridges and when meetyou.bridge locks window.MeiYouJSBridge via Object.defineProperty.
 */
const fs = require('fs');
const path = require('path');

const TOOLBOX_JSSDK_RE = /[\\/]@meetyou[\\/]toolbox[\\/]lib[\\/]jssdk[\\/]index\.js$/;
const MEET_JSSDK_RE = /[\\/]meetyou\.jssdk[\\/]lib[\\/]sdk\.js$/;
const MEET_BRIDGE_RE = /[\\/]meetyou\.bridge[\\/]lib[\\/]index\.js$/;
const BRIDGE_SDK_FILTER = /(?:[\\/]@meetyou[\\/]toolbox[\\/]lib[\\/]jssdk[\\/]index\.js$|[\\/]meetyou\.jssdk[\\/]lib[\\/]sdk\.js$|[\\/]meetyou\.bridge[\\/]lib[\\/]index\.js$)/;

const INVOKER_HELPER = [
  '',
  'function wvAgentBridgeInvoker(bridge) {',
  '    var probe = typeof window !== "undefined" && window.__WV_AGENT_API__;',
  '    return probe && typeof probe.getBridgeInvoker === "function"',
  '        ? probe.getBridgeInvoker(bridge)',
  '        : bridge.invoke.bind(bridge);',
  '}',
  '',
].join('\n');

const MEET_BRIDGE_HELPER = [
  '',
  'function wvAgentBridgeDescriptor(bridge, api, fn) {',
  '    var probe = typeof window !== "undefined" && window.__WV_AGENT_API__;',
  '    if (probe && typeof probe.wrapBridgeMethod === "function" && (api === "invoke" || api === "wait")) {',
  '        fn = probe.wrapBridgeMethod(bridge, api, fn);',
  '    }',
  '    return { value: fn, writable: true, configurable: true, enumerable: true };',
  '}',
  'function wvAgentWrapBridgeExport(bridge) {',
  '    var probe = typeof window !== "undefined" && window.__WV_AGENT_API__;',
  '    if (!probe || !bridge || bridge.__wvAgentShim__ || typeof probe.wrapBridgeExport !== "function") {',
  '        return bridge;',
  '    }',
  '    return probe.wrapBridgeExport(bridge);',
  '}',
  '',
].join('\n');

function instrumentToolboxJssdk(source) {
  var contents = source
    .replace(/\bwindow\.MeiYouJSBridge\.invoke(?=\s*\()/g, 'wvAgentBridgeInvoker(window.MeiYouJSBridge)')
    .replace(
      /\((\w+)\s*=\s*window\.MeiYouJSBridge\)\.invoke(?=\s*\.apply\s*\()/g,
      'wvAgentBridgeInvoker($1 = window.MeiYouJSBridge)'
    );
  if (contents === source) return null;
  return contents + INVOKER_HELPER;
}

function instrumentMeetyouJssdk(source) {
  var contents = source
    .replace(/\b((?:window\.)?MeiYouJSBridge)\.invoke(?=\s*\()/g, 'wvAgentBridgeInvoker($1)')
    .replace(/\b((?:window\.)?MeiYouJSBridge)\.invoke(?=\s*\.apply\s*\()/g, 'wvAgentBridgeInvoker($1)');
  if (contents === source) return null;
  return contents + INVOKER_HELPER;
}

function instrumentMeetyouBridge(source) {
  var contents = source
    .replace(
      /Object\.defineProperty\(\s*bridge\s*,\s*api\s*,\s*\{\s*value\s*:\s*(bridgeApi|legacyApi)\[api\]\s*\}\s*\)/g,
      'Object.defineProperty(bridge, api, wvAgentBridgeDescriptor(bridge, api, $1[api]))'
    )
    .replace(
      /\bmodule\.exports\s*=\s*MeiYouJSBridge\s*;/g,
      'module.exports = wvAgentWrapBridgeExport(MeiYouJSBridge);'
    );
  if (contents === source) return null;
  return contents + MEET_BRIDGE_HELPER;
}

/**
 * Transform supported JSBridge SDK files. Returns transformed source string or null if unchanged/unsupported.
 */
function instrumentBridgeSdkSource(filePath, source) {
  if (!source || typeof source !== 'string') return null;
  var p = String(filePath || '');
  if (TOOLBOX_JSSDK_RE.test(p)) {
    return instrumentToolboxJssdk(source);
  }
  if (MEET_JSSDK_RE.test(p)) {
    return instrumentMeetyouJssdk(source);
  }
  if (MEET_BRIDGE_RE.test(p)) {
    return instrumentMeetyouBridge(source);
  }
  // Fallback heuristic when a fixture path doesn't match node_modules layout directly
  var toolboxRes = instrumentToolboxJssdk(source);
  if (toolboxRes) return toolboxRes;
  var jssdkRes = instrumentMeetyouJssdk(source);
  if (jssdkRes) return jssdkRes;
  return instrumentMeetyouBridge(source);
}

/**
 * Vite / esbuild dev optimizeDeps plugin covering all supported JSBridge SDKs.
 */
function createBridgeEsbuildPlugin() {
  return {
    name: 'wv-agent-toolbox-bridge',
    setup: function (build) {
      build.onLoad({ filter: BRIDGE_SDK_FILTER }, async function (args) {
        const original = await fs.promises.readFile(args.path, 'utf8');
        const contents = instrumentBridgeSdkSource(args.path, original);
        if (!contents) return;
        return { contents: contents, loader: 'js', resolveDir: path.dirname(args.path) };
      });
    },
  };
}

module.exports = {
  BRIDGE_SDK_FILTER: BRIDGE_SDK_FILTER,
  TOOLBOX_JSSDK_RE: TOOLBOX_JSSDK_RE,
  MEET_JSSDK_RE: MEET_JSSDK_RE,
  MEET_BRIDGE_RE: MEET_BRIDGE_RE,
  instrumentBridgeSdkSource: instrumentBridgeSdkSource,
  createBridgeEsbuildPlugin: createBridgeEsbuildPlugin,
};
