import type {
  WvAgentEsbuildPlugin,
  WvAgentMiddlewareOptions,
  WvAgentViteHtmlTagDescriptor,
  WvAgentVitePlugin,
} from './middleware.mjs';

export type {
  WvAgentEsbuildPlugin,
  WvAgentMiddlewareOptions,
  WvAgentViteHtmlTagDescriptor,
  WvAgentVitePlugin,
};

export declare function wvAgentVitePlugin(
  options?: WvAgentMiddlewareOptions
): WvAgentVitePlugin;

export default wvAgentVitePlugin;
