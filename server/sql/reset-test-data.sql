-- =====================================================================
-- 清空测试数据：只清商城业务表，保留 user / role / permission / user_roles
-- 用法：先跑本脚本清空，再跑 seed-test-data.sql 重新灌入干净数据。
--   mysql -u root -p fe_prediction < server/sql/reset-test-data.sql
--   mysql -u root -p fe_prediction < server/sql/seed-test-data.sql
-- 注意：TRUNCATE 会重置自增 id，且不可回滚，仅用于测试库。
-- =====================================================================
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `order_item`;
TRUNCATE TABLE `order`;
TRUNCATE TABLE `cart_item`;
TRUNCATE TABLE `favorite`;
TRUNCATE TABLE `user_coupon`;
TRUNCATE TABLE `coupon`;
TRUNCATE TABLE `address`;
TRUNCATE TABLE `product`;
TRUNCATE TABLE `category`;
TRUNCATE TABLE `banner`;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '🧹 商城测试数据已清空（用户/角色/权限保留）' AS result;
