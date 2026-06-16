-- =====================================================================
-- 测试数据：分类 / 轮播 / 商品 / dev用户 / 地址 / 购物车 / 订单
-- 可重复执行（固定主键 + ON DUPLICATE KEY UPDATE）。
-- 前置：已执行 init-tables.sql 建好表。
-- 图片统一用占位图，真机可正常加载。
-- =====================================================================
SET NAMES utf8mb4;

-- 占位图变量
SET @IMG := 'https://img14.360buyimg.com/imagetools/jfs/t1/167902/2/8762/791358/603742d7E9b4275e3/e09d8f9a8bf4c0ef.png';

-- ---------------------------------------------------------------------
-- 分类（8）
-- ---------------------------------------------------------------------
INSERT INTO `category` (`id`,`name`,`icon`,`sort`,`status`) VALUES
  (1,'手机数码',@IMG,1,1),
  (2,'电脑办公',@IMG,2,1),
  (3,'家用电器',@IMG,3,1),
  (4,'服饰鞋包',@IMG,4,1),
  (5,'美妆护肤',@IMG,5,1),
  (6,'食品生鲜',@IMG,6,1),
  (7,'家居家装',@IMG,7,1),
  (8,'母婴玩具',@IMG,8,1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`icon`=VALUES(`icon`),`sort`=VALUES(`sort`),`status`=VALUES(`status`);

-- ---------------------------------------------------------------------
-- 轮播（3）
-- ---------------------------------------------------------------------
INSERT INTO `banner` (`id`,`image`,`title`,`link`,`sort`,`status`) VALUES
  (1,@IMG,'新年焕新季','/pages/index/index',1,1),
  (2,@IMG,'数码好物推荐','/pages/index/index',2,1),
  (3,@IMG,'家电狂欢节','/pages/index/index',3,1)
ON DUPLICATE KEY UPDATE `image`=VALUES(`image`),`title`=VALUES(`title`),`link`=VALUES(`link`),`sort`=VALUES(`sort`),`status`=VALUES(`status`);

-- ---------------------------------------------------------------------
-- 商品（20，跨分类，部分推荐 isRecommend=1）
-- ---------------------------------------------------------------------
INSERT INTO `product`
  (`id`,`name`,`price`,`originalPrice`,`image`,`sales`,`stock`,`categoryId`,`description`,`isRecommend`,`status`) VALUES
  (1,'Apple iPhone 15 Pro Max 256GB 原色钛金属',9999,10999,@IMG,12580,200,1,'A17 Pro 芯片，钛金属机身',1,1),
  (2,'华为Mate 60 Pro 雅丹黑 12GB+512GB',6999,7999,@IMG,8920,150,1,'国产旗舰，卫星通话',1,1),
  (3,'小米14 Ultra 16GB+512GB 白色',5999,6499,@IMG,7890,180,1,'徕卡四摄，骁龙8 Gen3',1,1),
  (4,'索尼WH-1000XM5 无线降噪耳机 黑色',2299,2999,@IMG,5620,300,1,'旗舰降噪，30小时续航',1,1),
  (5,'MacBook Pro 14英寸 M3 Pro 18GB+512GB',16999,18999,@IMG,2180,80,2,'M3 Pro 芯片，专业性能',1,1),
  (6,'联想ThinkPad X1 Carbon 14英寸',12999,14999,@IMG,1560,60,2,'商务轻薄本',0,1),
  (7,'戴尔U2723QE 27英寸 4K 显示器',4299,4999,@IMG,2340,120,2,'4K IPS，Type-C 90W',0,1),
  (8,'罗技MX Master 3S 无线鼠标',699,899,@IMG,8800,500,2,'静音按键，8K DPI',1,1),
  (9,'戴森V15 Detect 无绳吸尘器',4990,5990,@IMG,3450,90,3,'激光探测灰尘',1,1),
  (10,'美的变频空调挂机 1.5匹 一级能效',2899,3499,@IMG,4200,140,3,'新一级能效，节能静音',0,1),
  (11,'海尔对开门冰箱 521升',3699,4299,@IMG,1980,70,3,'风冷无霜，变频',0,1),
  (12,'Nike Air Force 1 经典小白鞋',799,899,@IMG,15600,400,4,'经典百搭',1,1),
  (13,'优衣库男士摇粒绒外套',199,299,@IMG,9300,600,4,'保暖轻便',0,1),
  (14,'雅诗兰黛小棕瓶精华 50ml',780,1080,@IMG,6700,250,5,'修护精华',1,1),
  (15,'兰蔻菁纯面霜 50ml',1280,1580,@IMG,2100,130,5,'抗老紧致',0,1),
  (16,'三只松鼠每日坚果 750g',89,129,@IMG,18900,800,6,'每日一袋，营养均衡',0,1),
  (17,'褚橙冰糖橙 5斤装',59,89,@IMG,12300,1000,6,'酸甜可口',1,1),
  (18,'宜家拉克边桌 北欧风',79,99,@IMG,7600,350,7,'简约百搭',0,1),
  (19,'乐高积木 兰博基尼跑车',3299,3699,@IMG,1450,50,8,'1:8 收藏级',1,1),
  (20,'费雪声光安抚海马 婴儿玩具',129,169,@IMG,5400,420,8,'助眠安抚',0,1)
ON DUPLICATE KEY UPDATE
  `name`=VALUES(`name`),`price`=VALUES(`price`),`originalPrice`=VALUES(`originalPrice`),
  `image`=VALUES(`image`),`sales`=VALUES(`sales`),`stock`=VALUES(`stock`),
  `categoryId`=VALUES(`categoryId`),`description`=VALUES(`description`),
  `isRecommend`=VALUES(`isRecommend`),`status`=VALUES(`status`);

-- ---------------------------------------------------------------------
-- dev 测试用户（与本地兜底登录 openid 一致）
-- ---------------------------------------------------------------------
INSERT INTO `user` (`openid`,`nickname`,`avatar`,`gender`,`phone`,`status`) VALUES
  ('dev_openid_0001','测试用户小方',@IMG,1,'13800000000',1)
ON DUPLICATE KEY UPDATE `nickname`=VALUES(`nickname`),`avatar`=VALUES(`avatar`);

-- 取该用户 id 供后续引用
SET @uid := (SELECT id FROM `user` WHERE openid='dev_openid_0001');

-- 给 dev 用户挂 admin 角色（admin 角色由 init-tables.sql 创建）
INSERT INTO `user_roles` (`user_id`,`role_id`)
SELECT @uid, r.id FROM `role` r WHERE r.code='admin'
ON DUPLICATE KEY UPDATE `user_id`=`user_roles`.`user_id`;

-- ---------------------------------------------------------------------
-- 收货地址（2 条，1 默认）
-- ---------------------------------------------------------------------
INSERT INTO `address`
  (`id`,`userId`,`name`,`phone`,`province`,`city`,`district`,`detail`,`isDefault`) VALUES
  (1,@uid,'方阳','13800000000','广东省','深圳市','南山区','科技园路 1 号腾讯大厦 A 座',1),
  (2,@uid,'方阳(公司)','13900000000','广东省','广州市','天河区','珠江新城 CBD 88 号',0)
ON DUPLICATE KEY UPDATE
  `userId`=VALUES(`userId`),`name`=VALUES(`name`),`phone`=VALUES(`phone`),
  `province`=VALUES(`province`),`city`=VALUES(`city`),`district`=VALUES(`district`),
  `detail`=VALUES(`detail`),`isDefault`=VALUES(`isDefault`);

-- ---------------------------------------------------------------------
-- 购物车（3 项，勾选状态不同）
-- ---------------------------------------------------------------------
INSERT INTO `cart_item` (`userId`,`productId`,`quantity`,`checked`) VALUES
  (@uid,1,1,1),
  (@uid,4,2,1),
  (@uid,12,1,0)
ON DUPLICATE KEY UPDATE `quantity`=VALUES(`quantity`),`checked`=VALUES(`checked`);

-- ---------------------------------------------------------------------
-- 订单（覆盖 5 种状态，让"我的"页角标都有数字）
--   unpaid 待付款 / unshipped 待发货 / shipping 待收货
--   unreviewed 待评价 / after_sale 售后 / completed 已完成
-- ---------------------------------------------------------------------
INSERT INTO `order`
  (`id`,`orderNo`,`userId`,`status`,`totalAmount`,`addressSnapshot`,`remark`,`paidAt`) VALUES
  (1,'TEST202606160001',@uid,'unpaid',     9999,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}','尽快发货',NULL),
  (2,'TEST202606160002',@uid,'unshipped',  4598,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}',NULL,NOW()),
  (3,'TEST202606160003',@uid,'shipping',    799,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}',NULL,NOW()),
  (4,'TEST202606160004',@uid,'unreviewed', 2299,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}',NULL,NOW()),
  (5,'TEST202606160005',@uid,'after_sale',  699,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}','申请退货',NOW()),
  (6,'TEST202606160006',@uid,'completed',  6999,'{"name":"方阳","phone":"13800000000","detail":"科技园路1号"}',NULL,NOW())
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`),`totalAmount`=VALUES(`totalAmount`);

-- 订单明细
INSERT INTO `order_item` (`id`,`orderId`,`productId`,`name`,`price`,`image`,`quantity`) VALUES
  (1,1,1,'Apple iPhone 15 Pro Max 256GB 原色钛金属',9999,@IMG,1),
  (2,2,4,'索尼WH-1000XM5 无线降噪耳机 黑色',2299,@IMG,2),
  (3,3,12,'Nike Air Force 1 经典小白鞋',799,@IMG,1),
  (4,4,4,'索尼WH-1000XM5 无线降噪耳机 黑色',2299,@IMG,1),
  (5,5,8,'罗技MX Master 3S 无线鼠标',699,@IMG,1),
  (6,6,2,'华为Mate 60 Pro 雅丹黑 12GB+512GB',6999,@IMG,1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`price`=VALUES(`price`),`quantity`=VALUES(`quantity`);

-- ---------------------------------------------------------------------
-- 优惠券模板（3）
-- ---------------------------------------------------------------------
INSERT INTO `coupon` (`id`,`name`,`type`,`value`,`minSpend`,`expireAt`,`status`) VALUES
  (1,'新人满100减20','amount',20,100,'2026-12-31 23:59:59',1),
  (2,'全场95折','discount',95,0,'2026-12-31 23:59:59',1),
  (3,'满1000减150','amount',150,1000,'2026-12-31 23:59:59',1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`value`=VALUES(`value`),`minSpend`=VALUES(`minSpend`);

-- dev 用户领取 2 张券（1 未用 1 已用）
INSERT INTO `user_coupon` (`userId`,`couponId`,`status`) VALUES
  (@uid,1,'unused'),
  (@uid,2,'used')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- ---------------------------------------------------------------------
-- 收藏（dev 用户收藏 3 个商品）
-- ---------------------------------------------------------------------
INSERT INTO `favorite` (`userId`,`productId`) VALUES
  (@uid,1),
  (@uid,5),
  (@uid,9)
ON DUPLICATE KEY UPDATE `userId`=`favorite`.`userId`;

-- 完成。查看角标预期：待付款1 待发货1 待收货1 待评价1 售后1
SELECT '✅ 测试数据已插入' AS result, @uid AS dev_user_id;
