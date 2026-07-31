-- 数据库关系实操 02
-- 目标：看懂主键、唯一键、普通索引和外键。
-- 本脚本中的可执行语句都是只读查询，不会修改数据。

USE relationship_lab;

-- 1. 查看 MySQL 最终保存的建表语句
-- 重点观察：PRIMARY KEY、UNIQUE KEY、KEY、FOREIGN KEY。
SHOW CREATE TABLE orders;
SHOW CREATE TABLE order_item;

-- 2. 查看 orders 表的全部索引
-- Non_unique = 0：值不能重复；Non_unique = 1：值可以重复。
SHOW INDEX FROM orders;

-- 3. 从系统表中查看关系约束
SELECT
  tc.TABLE_NAME AS table_name,
  tc.CONSTRAINT_NAME AS constraint_name,
  tc.CONSTRAINT_TYPE AS constraint_type,
  kcu.COLUMN_NAME AS column_name,
  kcu.REFERENCED_TABLE_NAME AS referenced_table,
  kcu.REFERENCED_COLUMN_NAME AS referenced_column
FROM information_schema.TABLE_CONSTRAINTS AS tc
LEFT JOIN information_schema.KEY_COLUMN_USAGE AS kcu
  ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND kcu.TABLE_NAME = tc.TABLE_NAME
 AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = 'relationship_lab'
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;

-- 4. 观察索引是否被查询使用
-- 结果中的 key 若为 idx_orders_customer，就表示使用了该索引。
EXPLAIN
SELECT *
FROM orders
WHERE customer_id = 1;

-- ================================================================
-- 以下是故意触发错误的练习，请逐条复制到 MySQL 中执行。
-- 它们都应该失败，因此不会留下脏数据。
-- ================================================================

-- 练习 A：重复主键，应得到 Duplicate entry 错误
-- INSERT INTO customer (id, name) VALUES (1, '重复主键');

-- 练习 B：重复唯一值，应得到 Duplicate entry 错误
-- INSERT INTO orders (order_no, customer_id)
-- VALUES ('LAB-20260730-001', 1);

-- 练习 C：引用不存在的客户，应得到 foreign key constraint 错误
-- INSERT INTO orders (order_no, customer_id)
-- VALUES ('LAB-WRONG-002', 999);

-- 练习 D：customer_id 不是 UNIQUE，一个客户可以有多张订单。
-- 这条是合法数据；观察完成后用 ROLLBACK 撤销。
-- START TRANSACTION;
-- INSERT INTO orders (order_no, customer_id)
-- VALUES ('LAB-TEMP-001', 1);
-- SELECT * FROM orders WHERE customer_id = 1;
-- ROLLBACK;
