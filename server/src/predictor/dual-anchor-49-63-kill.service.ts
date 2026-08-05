import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { ProspectiveDualAnchorKillBase } from './prospective-dual-anchor-kill.base';

@Injectable()
export class DualAnchor4963KillService extends ProspectiveDualAnchorKillBase {
  constructor(historyService: HistoryService) {
    super(historyService, {
      key: 'dualAnchor49And63',
      name: '49+63期双锚点',
      formula: '−2x − y + 10',
      description:
        '固定读取49期前第4位x和63期前第1位y，计算−2x−y+10，再在1～49范围循环回绕。策略从2026年第199期起冻结观察。',
      first: { lag: 49, position: 4, label: '49期前第4位' },
      second: { lag: 63, position: 1, label: '63期前第1位' },
      calculate: (first, second) => -2 * first - second + 10,
      formatCalculation: (first, second, rawValue) =>
        `−2 × ${first} − ${second} + 10 = ${rawValue}`,
    });
  }
}
