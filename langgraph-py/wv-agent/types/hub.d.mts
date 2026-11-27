export declare const DEFAULT_HUB_PORT: number;

export interface WvAgentHubOptions {
  port?: number;
  host?: string;
}

export interface WvAgentHubStartInfo {
  port: number;
  host: string;
  lanIps: string[];
}

export interface WvAgentDeviceMeta {
  clientId: string;
  platform: string;
  model?: string;
  url: string;
  title: string;
  hasBridge: boolean;
  bridgeCapture?: string;
  viewport?: { width: number; height: number; dpr?: number };
  ua?: string;
  [key: string]: any;
}

export interface WvAgentSession {
  clientId: string;
  instanceId: string;
  transport: 'ws' | 'http';
  connected: boolean;
  meta: WvAgentDeviceMeta;
  connectedAt: number | null;
  lastSeenAt: number;
  traces: Array<Record<string, any>>;
  consoles: Array<Record<string, any>>;
  errors: Array<Record<string, any>>;
  network: Array<Record<string, any>>;
  observations: Array<Record<string, any>>;
}

export declare class WvAgentHub {
  port: number;
  host: string;
  sessions: Map<string, WvAgentSession>;

  constructor(options?: WvAgentHubOptions);
  resolveDevice(deviceFilter?: string, options?: { allowOffline?: boolean }): WvAgentSession;
  sendRpc(
    session: WvAgentSession,
    cmd: string,
    payload?: Record<string, any>,
    timeoutMs?: number
  ): Promise<any>;
  start(): Promise<WvAgentHubStartInfo>;
  stop(): Promise<void>;
}
