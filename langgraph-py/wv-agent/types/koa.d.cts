declare function createWvAgentKoaMiddleware(
  options?: createWvAgentKoaMiddleware.WvAgentMiddlewareOptions
): createWvAgentKoaMiddleware.WvAgentKoaMiddleware;

declare namespace createWvAgentKoaMiddleware {
  export interface WvAgentMiddlewareOptions {
    mountPath?: string;
    hubHost?: string;
    hubPort?: number;
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

  export function createWvAgentKoaMiddleware(
    options?: WvAgentMiddlewareOptions
  ): WvAgentKoaMiddleware;
}

export = createWvAgentKoaMiddleware;
