import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { ProspectiveDualAnchorKillBase } from './prospective-dual-anchor-kill.base';

@Injectable()
export class ShortLongAnchor149KillService extends ProspectiveDualAnchorKillBase {
  constructor(historyService: HistoryService) {
    super(historyService, {
      key: 'shortLongAnchor1And49',
      name: '1+49期短长双锚点',
      formula: '−2x + y + 39',
      description:
        '固定读取上一期第1位x和49期前第3位y，计算−2x+y+39，再在1～49范围循环回绕。策略从2026年第199期起冻结观察。',
      first: { lag: 1, position: 1, label: '上一期第1位' },
      second: { lag: 49, position: 3, label: '49期前第3位' },
      calculate: (first, second) => -2 * first + second + 39,
      formatCalculation: (first, second, rawValue) =>
        `−2 × ${first} + ${second} + 39 = ${rawValue}`,
    });
  }
}
