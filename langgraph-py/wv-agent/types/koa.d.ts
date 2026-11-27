import type {
  WvAgentKoaContext,
  WvAgentKoaMiddleware,
  WvAgentKoaNext,
  WvAgentMiddlewareOptions,
} from './middleware';

export type {
  WvAgentKoaContext,
  WvAgentKoaMiddleware,
  WvAgentKoaNext,
  WvAgentMiddlewareOptions,
};

export declare function createWvAgentKoaMiddleware(
  options?: WvAgentMiddlewareOptions
): WvAgentKoaMiddleware;

export default createWvAgentKoaMiddleware;
