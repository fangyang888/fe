declare function wvAgentWebpackPlugin(
  options?: wvAgentWebpackPlugin.WvAgentWebpackPluginOptions
): wvAgentWebpackPlugin.WvAgentWebpackPlugin;

declare namespace wvAgentWebpackPlugin {
  export interface WvAgentWebpackPluginOptions {
    onlyWhenEnv?: boolean;
  }

  export interface WvAgentWebpackPlugin {
    name: string;
    apply(compiler: any): void;
  }

  export function wvAgentWebpackPlugin(
    options?: WvAgentWebpackPluginOptions
  ): WvAgentWebpackPlugin;
}

export = wvAgentWebpackPlugin;
