-- 数据库关系实操 01
-- 目标：从创建数据库开始，理解一对一、一对多、多对多。
-- 安全性：本脚本不会删除数据库或表，可以重复执行。

-- 1. 创建并进入独立练习库
CREATE DATABASE IF NOT EXISTS relationship_lab
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE relationship_lab;

-- 2. 主表：客户
CREATE TABLE IF NOT EXISTS customer (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  PRIMARY KEY (id)
) ENGINE = InnoDB;

-- 3. 一对一：一个客户最多有一份客户资料
-- customer_id 同时具有 UNIQUE 和 FOREIGN KEY：
-- FOREIGN KEY 保证客户必须存在；UNIQUE 保证一个客户只能出现一次。
CREATE TABLE IF NOT EXISTS customer_profile (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  phone VARCHAR(20),
  city VARCHAR(50),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_profile_customer (customer_id),
  CONSTRAINT fk_profile_customer
    FOREIGN KEY (customer_id) REFERENCES customer (id)
    ON DELETE CASCADE
) ENGINE = InnoDB;

-- 4. 一对多：一个客户可以有多张订单，一张订单只属于一个客户
-- 外键放在“多”的一侧，也就是 orders.customer_id。
CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(30) NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_no (order_no),
  KEY idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customer (id)
    ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 5. 商品表
-- 金额用“分”保存为整数，避免浮点数精度问题。
CREATE TABLE IF NOT EXISTS product (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  price_cent INT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE = InnoDB;

-- 6. 多对多：一张订单有多种商品，一种商品也能出现在多张订单中
-- 关系型数据库用中间表把多对多拆成两个一对多。
-- quantity 和 unit_price_cent 是“这次购买关系”本身的属性。
CREATE TABLE IF NOT EXISTS order_item (
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price_cent INT UNSIGNED NOT NULL,
  PRIMARY KEY (order_id, product_id),
  KEY idx_order_item_product (product_id),
  CONSTRAINT fk_order_item_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_item_product
    FOREIGN KEY (product_id) REFERENCES product (id)
    ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 7. 准备可重复执行的练习数据
INSERT INTO customer (id, name) VALUES
  (1, '小杨'),
  (2, '小林')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO customer_profile (id, customer_id, phone, city) VALUES
  (1, 1, '13800000001', '上海'),
  (2, 2, '13800000002', '杭州')
ON DUPLICATE KEY UPDATE
  phone = VALUES(phone),
  city = VALUES(city);

INSERT INTO product (id, name, price_cent) VALUES
  (1, '机械键盘', 39900),
  (2, '无线鼠标', 19900),
  (3, '显示器支架', 25900)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  price_cent = VALUES(price_cent);

INSERT INTO orders (id, order_no, customer_id) VALUES
  (1, 'LAB-20260730-001', 1),
  (2, 'LAB-20260730-002', 1),
  (3, 'LAB-20260730-003', 2)
ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id);

INSERT INTO order_item
  (order_id, product_id, quantity, unit_price_cent)
VALUES
  (1, 1, 1, 39900),
  (1, 2, 2, 19900),
  (2, 3, 1, 25900),
  (3, 2, 1, 19900)
ON DUPLICATE KEY UPDATE
  quantity = VALUES(quantity),
  unit_price_cent = VALUES(unit_price_cent);

-- 8. 查询练习：把分散在多张表中的信息重新组合起来
SELECT
  c.name AS customer_name,
  cp.city,
  o.order_no,
  p.name AS product_name,
  oi.quantity,
  oi.unit_price_cent,
  oi.quantity * oi.unit_price_cent AS line_total_cent
FROM customer AS c
JOIN customer_profile AS cp ON cp.customer_id = c.id
JOIN orders AS o ON o.customer_id = c.id
JOIN order_item AS oi ON oi.order_id = o.id
JOIN product AS p ON p.id = oi.product_id
ORDER BY o.id, p.id;

-- 9. 聚合练习：计算每张订单的总金额
SELECT
  o.order_no,
  c.name AS customer_name,
  SUM(oi.quantity * oi.unit_price_cent) AS order_total_cent
FROM orders AS o
JOIN customer AS c ON c.id = o.customer_id
JOIN order_item AS oi ON oi.order_id = o.id
GROUP BY o.id, o.order_no, c.name
ORDER BY o.id;
