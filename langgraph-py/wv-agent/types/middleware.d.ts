export interface WvAgentMiddlewareOptions {
  /** URL prefix mounted on the dev server to proxy client.js and HTTP long-poll traffic. Defaults to `'/__wv_agent__'`. */
  mountPath?: string;
  /** Local wv-agent Hub host. Defaults to `'127.0.0.1'`. */
  hubHost?: string;
  /** Local wv-agent Hub port. Defaults to `Number(process.env.WV_AGENT_PORT || 19527)`. */
  hubPort?: number;
  /** When `true`, middleware and plugins stay inactive unless `process.env.WV_AGENT === '1'`. Defaults to `false`. */
  onlyWhenEnv?: boolean;
}

export interface WvAgentHttpRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  pipe?: (...args: any[]) => any;
}

export interface WvAgentHttpResponse {
  statusCode: number;
  headersSent?: boolean;
  setHeader(name: string, value: number | string | readonly string[]): any;
  getHeader(name: string): number | string | string[] | undefined;
  write(...args: any[]): any;
  end(...args: any[]): any;
}

export type WvAgentNextFunction = (err?: any) => void;

export type WvAgentConnectMiddleware = (
  req: WvAgentHttpRequest,
  res: WvAgentHttpResponse,
  next: WvAgentNextFunction
) => void;

export interface WvAgentKoaContext {
  url?: string;
  method?: string;
  type?: string;
  body?: any;
  respond?: boolean;
  headers?: Record<string, string | string[] | undefined>;
  req: WvAgentHttpRequest;
  res: WvAgentHttpResponse;
  request?: { rawBody?: any; body?: any };
  response?: { get(field: string): string };
}

export type WvAgentKoaNext = () => PromiseLike<any>;

export type WvAgentKoaMiddleware = (
  ctx: WvAgentKoaContext,
  next: WvAgentKoaNext
) => PromiseLike<void>;

export interface WvAgentViteHtmlTagDescriptor {
  tag: string;
  attrs?: Record<string, string | boolean | undefined>;
  injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend';
}

export interface WvAgentEsbuildPlugin {
  name: string;
  setup(build: any): any;
}

export interface WvAgentVitePlugin {
  name: string;
  apply: 'serve';
  config(): { optimizeDeps: { esbuildOptions: { plugins: WvAgentEsbuildPlugin[] } } } | undefined;
  configureServer(server: { middlewares: { use(middleware: any): any } }): void;
  transformIndexHtml(): WvAgentViteHtmlTagDescriptor[] | void;
}

export interface WvAgentWebpackPluginOptions {
  /** When `true`, plugin stays inactive unless `process.env.WV_AGENT === '1'`. Defaults to `false`. */
  onlyWhenEnv?: boolean;
}

export interface WvAgentWebpackPlugin {
  name: string;
  apply(compiler: any): void;
}

export declare function createWvAgentMiddleware(
  options?: WvAgentMiddlewareOptions
): WvAgentConnectMiddleware;

export declare function createWvAgentKoaMiddleware(
  options?: WvAgentMiddlewareOptions
): WvAgentKoaMiddleware;

export declare function wvAgentVitePlugin(
  options?: WvAgentMiddlewareOptions
): WvAgentVitePlugin;

export declare function wvAgentWebpackPlugin(
  options?: WvAgentWebpackPluginOptions
): WvAgentWebpackPlugin;

export default createWvAgentMiddleware;
