/**
 * 首页数据种子：把 miniapp/src/data/homeData.json 灌入 banner / category / product 表。
 * 商品默认设为推荐(isRecommend=1)，并按名称粗略归类到第一个分类。
 *
 * 使用方式: npx ts-node scripts/seed-home.ts
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createConnection } from 'typeorm';
import { Product } from '../src/product/product.entity';
import { Category } from '../src/category/category.entity';
import { Banner } from '../src/banner/banner.entity';

dotenv.config({ path: join(__dirname, '..', '.env') });

// 占位图：homeData 里是本地相对路径，真机加载不到，统一换成可访问的占位图
const PLACEHOLDER =
  'https://img14.360buyimg.com/imagetools/jfs/t1/167902/2/8762/791358/603742d7E9b4275e3/e09d8f9a8bf4c0ef.png';

async function seed() {
  const homePath = join(
    __dirname,
    '..',
    '..',
    'miniapp',
    'src',
    'data',
    'homeData.json',
  );
  const home = JSON.parse(readFileSync(homePath, 'utf-8'));

  const connection = await createConnection({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
    entities: [Product, Category, Banner],
    synchronize: true,
  });
  console.log('✅ 数据库连接成功，表已同步');

  const bannerRepo = connection.getRepository(Banner);
  const catRepo = connection.getRepository(Category);
  const prodRepo = connection.getRepository(Product);

  // 1) 轮播
  if ((await bannerRepo.count()) === 0) {
    await bannerRepo.save(
      (home.banners || []).map((b: any, i: number) =>
        bannerRepo.create({
          image: PLACEHOLDER,
          title: b.title,
          link: b.link,
          sort: i,
          status: 1,
        }),
      ),
    );
    console.log(`✅ 轮播导入 ${home.banners.length} 条`);
  } else {
    console.log('⚠️  banner 表已有数据，跳过');
  }

  // 2) 分类
  if ((await catRepo.count()) === 0) {
    await catRepo.save(
      (home.categories || []).map((c: any, i: number) =>
        catRepo.create({ name: c.name, icon: PLACEHOLDER, sort: i, status: 1 }),
      ),
    );
    console.log(`✅ 分类导入 ${home.categories.length} 条`);
  } else {
    console.log('⚠️  category 表已有数据，跳过');
  }

  // 3) 商品（设为推荐）
  if ((await prodRepo.count()) === 0) {
    await prodRepo.save(
      (home.recommendProducts || []).map((p: any) =>
        prodRepo.create({
          name: p.name,
          price: p.price,
          originalPrice: p.originalPrice,
          image: PLACEHOLDER,
          sales: p.sales || 0,
          stock: 999,
          categoryId: 1,
          isRecommend: 1,
          status: 1,
        }),
      ),
    );
    console.log(`✅ 商品导入 ${home.recommendProducts.length} 条`);
  } else {
    console.log('⚠️  product 表已有数据，跳过');
  }

  await connection.close();
  console.log('🔒 完成');
}

seed().catch((err) => {
  console.error('❌ seed 失败:', err.message);
  process.exit(1);
});
