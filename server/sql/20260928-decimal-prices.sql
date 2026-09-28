-- 发布新服务前执行；先备份 product、order、order_item。
-- 保持单位为元：89 -> 89.00，不做乘除换算，也不删除数据。
-- 可重复执行。MySQL DDL 会自动提交，不能依赖事务回滚。
ALTER TABLE `product`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL,
  MODIFY COLUMN `originalPrice` DECIMAL(12,2) NULL;
ALTER TABLE `order` MODIFY COLUMN `totalAmount` DECIMAL(12,2) NOT NULL;
ALTER TABLE `order_item` MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL;

-- 上线后核验字段类型；不要改回 INT，否则会丢失小数金额。
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'product' AND COLUMN_NAME IN ('price', 'originalPrice'))
    OR (TABLE_NAME = 'order' AND COLUMN_NAME = 'totalAmount')
    OR (TABLE_NAME = 'order_item' AND COLUMN_NAME = 'price'));
