const { parseLotteryHtml } = require('../../spider.js');

describe('lottery spider metadata parser', () => {
  it('按号码顺序解析颜色和生肖', () => {
    const html = `
      <div class="kj-tit">2026年01月02日 第<span class="text-blue">2</span>期</div>
      <div class="kj-box"><ul>
        <li><dl><dt class="ball-blue">42</dt><dd>牛<font>/</font></dd></dl></li>
        <li><dl><dt class="ball-green">17</dt><dd>虎<font>/</font></dd></dl></li>
        <li><dl><dt class="ball-red">12</dt><dd>羊<font>/</font></dd></dl></li>
        <li><dl><dt class="ball-red">46</dt><dd>鸡<font>/</font></dd></dl></li>
        <li><dl><dt class="ball-blue">9</dt><dd>狗<font>/</font></dd></dl></li>
        <li><dl><dt class="ball-red">24</dt><dd>羊<font>/</font></dd></dl></li>
        <li class="kj-jia"><dl><dt></dt><dd></dd></dl></li>
        <li><dl><dt class="ball-green">21</dt><dd>狗<font>/</font></dd></dl></li>
      </ul></div>
    `;

    const records = parseLotteryHtml(html, 2026);

    expect(records).toHaveLength(1);
    expect(records[0].items).toEqual([42, 17, 12, 46, 9, 24, 21]);
    expect(records[0].numberInfos).toEqual([
      { number: 42, color: '蓝', zodiac: '牛' },
      { number: 17, color: '绿', zodiac: '虎' },
      { number: 12, color: '红', zodiac: '羊' },
      { number: 46, color: '红', zodiac: '鸡' },
      { number: 9, color: '蓝', zodiac: '狗' },
      { number: 24, color: '红', zodiac: '羊' },
      { number: 21, color: '绿', zodiac: '狗' },
    ]);
  });
});
