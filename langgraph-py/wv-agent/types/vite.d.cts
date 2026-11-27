declare function wvAgentVitePlugin(
  options?: wvAgentVitePlugin.WvAgentMiddlewareOptions
): wvAgentVitePlugin.WvAgentVitePlugin;

declare namespace wvAgentVitePlugin {
  export interface WvAgentMiddlewareOptions {
    mountPath?: string;
    hubHost?: string;
    hubPort?: number;
    onlyWhenEnv?: boolean;
  }

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

  export function wvAgentVitePlugin(
    options?: WvAgentMiddlewareOptions
  ): WvAgentVitePlugin;
}

export = wvAgentVitePlugin;
