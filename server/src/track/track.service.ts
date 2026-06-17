import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';

export interface TrackEventDto {
  eventName: string;
  eventType?: string;
  userId?: number;
  openid?: string;
  sessionId?: string;
  page?: string;
  params?: Record<string, any>;
  platform?: string;
  appVersion?: string;
  os?: string;
  ts?: number;
}

@Injectable()
export class TrackService {
  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
  ) {}

  /** 批量入库（埋点上报） */
  async report(events: TrackEventDto[]) {
    if (!Array.isArray(events) || events.length === 0) {
      return { ok: true, count: 0 };
    }
    // 单次最多 200 条，防滥用
    const slice = events.slice(0, 200);
    const rows = slice.map((e) =>
      this.repo.create({
        eventName: e.eventName,
        eventType: e.eventType || 'custom',
        userId: e.userId,
        openid: e.openid,
        sessionId: e.sessionId,
        page: e.page,
        params: e.params,
        platform: e.platform || 'mp-weixin',
        appVersion: e.appVersion,
        os: e.os,
        ts: String(e.ts ?? Date.now()),
      }),
    );
    await this.repo.save(rows);
    return { ok: true, count: rows.length };
  }

  /** 简单概览统计（看板用）：某天各事件数 + PV/UV */
  async overview(date?: string) {
    const day = date || new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00`).getTime();
    const end = new Date(`${day}T23:59:59`).getTime();

    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.ts BETWEEN :start AND :end', {
        start: String(start),
        end: String(end),
      });

    const pv = await qb.clone().getCount();
    const uvRow = await qb
      .clone()
      .select('COUNT(DISTINCT e.openid)', 'uv')
      .getRawOne<{ uv: string }>();
    const byEvent = await qb
      .clone()
      .select('e.event_name', 'eventName')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.event_name')
      .getRawMany<{ eventName: string; count: string }>();

    return {
      date: day,
      pv,
      uv: Number(uvRow?.uv || 0),
      events: byEvent.map((r) => ({
        eventName: r.eventName,
        count: Number(r.count),
      })),
    };
  }
}
