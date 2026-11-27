import middlewareModule from './middleware.cjs';

export const createWvAgentMiddleware =
  middlewareModule.createWvAgentMiddleware || middlewareModule;
export const createWvAgentKoaMiddleware = middlewareModule.createWvAgentKoaMiddleware;
export const wvAgentVitePlugin = middlewareModule.wvAgentVitePlugin;
export const wvAgentWebpackPlugin = middlewareModule.wvAgentWebpackPlugin;

export default createWvAgentMiddleware;
