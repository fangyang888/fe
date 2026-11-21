import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REPORT = 'likely32-embedding-report.json';

@Injectable()
export class Likely32ReportService implements OnApplicationShutdown {
  private readonly logger = new Logger(Likely32ReportService.name);
  private readonly dataDirectory = resolve(
    process.cwd(),
    '..',
    'data',
    'likely32-embedding',
  );
  private readonly worker = resolve(
    process.cwd(),
    'dist',
    'likely32',
    'embedding-backtest.cjs',
  );
  private child?: ChildProcess;
  private pending = false;
  private stopping = false;
  private state: 'idle' | 'updating' | 'ready' | 'error' = 'idle';

  constructor(private readonly config: ConfigService) {}

  private embeddingConfig() {
    return {
      EDU_EMBED_BASE_URL: this.config.get<string>('EDU_EMBED_BASE_URL')?.trim(),
      EDU_EMBED_MODEL:
        this.config.get<string>('EDU_EMBED_MODEL')?.trim() ||
        'qwen3.7-text-embedding',
      EDU_EMBED_API_KEY: this.config.get<string>('EDU_EMBED_API_KEY')?.trim(),
    };
  }

  get status() {
    const config = this.embeddingConfig();
    return config.EDU_EMBED_BASE_URL && config.EDU_EMBED_API_KEY
      ? this.state
      : 'disabled';
  }

  refresh() {
    if (this.stopping || this.status === 'disabled') return 'disabled';
    this.pending = true;
    if (!this.child) this.launch();
    return 'queued';
  }

  private launch() {
    this.pending = false;
    this.state = 'updating';
    const port = this.config.get<string>('PORT', '3000');
    const embedding = this.embeddingConfig();
    this.child = execFile(
      process.execPath,
      [this.worker, `http://127.0.0.1:${port}/api/history`],
      {
        env: {
          ...embedding,
          LIKELY32_EMBED_DATA_DIR: this.dataDirectory,
          NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
        },
        timeout: 15 * 60_000,
      },
      (error, _stdout, stderr) => {
        this.child = undefined;
        if (this.stopping) return;
        this.state = error ? 'error' : 'ready';
        if (error) {
          const detail = embedding.EDU_EMBED_API_KEY
            ? stderr.replaceAll(embedding.EDU_EMBED_API_KEY, '[redacted]')
            : stderr;
          this.logger.warn(
            `Qwen 报告更新失败（${error.code ?? error.signal ?? 'unknown'}） ${detail.trim().slice(-300)}`,
          );
        }
        if (this.pending) this.launch();
      },
    );
  }

  async read(): Promise<Record<string, unknown>> {
    const runtime = resolve(this.dataDirectory, REPORT);
    const release = resolve(process.cwd(), '..', 'dist', REPORT);
    for (const file of [runtime, release]) {
      try {
        const report = JSON.parse(await readFile(file, 'utf8'));
        if (report?.version === 1 && typeof report.historyDigest === 'string')
          return report;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          this.logger.warn('Qwen 报告文件暂时无法读取');
      }
    }
    throw new NotFoundException('尚无 Qwen 报告');
  }

  onApplicationShutdown() {
    this.stopping = true;
    this.child?.kill();
  }
}
