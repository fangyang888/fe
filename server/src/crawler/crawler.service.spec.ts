import { Test, TestingModule } from '@nestjs/testing';
import { CrawlerService } from './crawler.service';

describe('CrawlerService', () => {
  let service: CrawlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrawlerService],
    }).compile();

    service = module.get<CrawlerService>(CrawlerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('CrawlerService HTML decoding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('decodes UTF-8 source HTML and supplies a request timeout', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<h1>什么是特码</h1>'));
    await expect(new CrawlerService().fetchUrl('https://example.com')).resolves.toBe('<h1>什么是特码</h1>');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });

  it('decodes GBK declared in legacy HTML metadata', async () => {
    const prefix = Buffer.from('<meta charset="gb2312"><p>');
    const bytes = Buffer.concat([prefix, Buffer.from([0xcc, 0xd8, 0xc2, 0xeb]), Buffer.from('</p>')]);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(bytes));
    await expect(new CrawlerService().fetchUrl('https://example.com')).resolves.toContain('<p>特码</p>');
  });

  it('rejects failed upstream responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(new CrawlerService().fetchUrl('https://example.com')).rejects.toThrow('503');
  });
});
