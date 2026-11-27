export type PluginTarget = 'all' | 'antigravity' | 'codex';

export interface PluginDirsOptions {
  pluginName?: string;
  antigravityRoot?: string;
  codexRoot?: string;
}

export interface PluginBuildOptions {
  outDir?: string;
  target?: PluginTarget;
  pluginName?: string;
  pkgName?: string;
  binName?: string;
}

export interface PluginInstallOptions extends PluginDirsOptions {
  target?: PluginTarget;
  pkgName?: string;
  binName?: string;
}

export interface PluginUninstallOptions extends PluginDirsOptions {
  target?: PluginTarget;
}

export interface PluginStatusOptions extends PluginDirsOptions {}

export interface PluginOutputEntry {
  dir: string;
  files: string[];
}

export interface PluginBuildResult {
  ok: true;
  action: 'build';
  pluginName: string;
  pkgName: string;
  binName: string;
  containsSourceCode: false;
  outDir: string;
  outputs: Partial<Record<'antigravity' | 'codex', PluginOutputEntry>>;
}

export interface PluginInstallResult {
  ok: true;
  action: 'install';
  pluginName: string;
  pkgName: string;
  binName: string;
  containsSourceCode: false;
  installed: Partial<Record<'antigravity' | 'codex', PluginOutputEntry>>;
}

export interface PluginUninstallResult {
  ok: true;
  action: 'uninstall';
  pluginName: string;
  removed: Partial<
    Record<'antigravity' | 'codex', { dir: string; existed: boolean; removed: boolean }>
  >;
}

export interface PluginStatusResult {
  ok: true;
  pluginName: string;
  antigravity: { installed: boolean; dir: string };
  codex: { installed: boolean; dir: string };
}

export declare function getDefaultInstallDirs(options?: PluginDirsOptions): {
  antigravity: string;
  codex: string;
};

export declare function buildPlugins(options?: PluginBuildOptions): PluginBuildResult;

export declare function installPlugins(options?: PluginInstallOptions): PluginInstallResult;

export declare function uninstallPlugins(options?: PluginUninstallOptions): PluginUninstallResult;

export declare function getPluginStatus(options?: PluginStatusOptions): PluginStatusResult;
