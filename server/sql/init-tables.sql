-- =====================================================================
-- 小程序商城 — 用户/RBAC + 商城 建表脚本
-- 与 TypeORM 实体一一对应。MySQL 8 / InnoDB / utf8mb4。
-- 生产环境 synchronize=false，需手动执行本脚本初始化表结构。
-- 注意：order、group 是保留字，已用反引号包裹。
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. 用户
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `openid`     VARCHAR(255) NOT NULL,
  `unionid`    VARCHAR(255) NULL,
  `nickname`   VARCHAR(255) NULL,
  `avatar`     VARCHAR(255) NULL,
  `gender`     TINYINT NULL,
  `phone`      VARCHAR(255) NULL,
  `status`     TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. 角色
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(255) NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `remark`     VARCHAR(255) NULL,
  `is_system`  TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_role_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3. 权限点
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permission` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(255) NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `group`      VARCHAR(255) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permission_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 4. 用户↔角色（多对多）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `idx_user_roles_user` (`user_id`),
  KEY `idx_user_roles_role` (`role_id`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 5. 角色↔权限（多对多）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       INT NOT NULL,
  `permission_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_role_perm_role` (`role_id`),
  KEY `idx_role_perm_perm` (`permission_id`),
  CONSTRAINT `fk_role_perm_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_perm_perm` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 6. 分类
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `category` (
  `id`     INT NOT NULL AUTO_INCREMENT,
  `name`   VARCHAR(255) NOT NULL,
  `icon`   VARCHAR(255) NULL,
  `sort`   INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 7. 轮播
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `banner` (
  `id`     INT NOT NULL AUTO_INCREMENT,
  `image`  VARCHAR(255) NOT NULL,
  `title`  VARCHAR(255) NULL,
  `link`   VARCHAR(255) NULL,
  `sort`   INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 8. 商品
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `product` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(255) NOT NULL,
  `price`         INT NOT NULL,
  `originalPrice` INT NULL,
  `image`         VARCHAR(255) NULL,
  `sales`         INT NOT NULL DEFAULT 0,
  `stock`         INT NOT NULL DEFAULT 0,
  `categoryId`    INT NULL,
  `description`   TEXT NULL,
  `isRecommend`   TINYINT NOT NULL DEFAULT 0,
  `status`        TINYINT NOT NULL DEFAULT 1,
  `created_at`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_product_category` (`categoryId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 9. 购物车项
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cart_item` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `userId`     INT NOT NULL,
  `productId`  INT NOT NULL,
  `quantity`   INT NOT NULL DEFAULT 1,
  `checked`    TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_product` (`userId`, `productId`),
  KEY `idx_cart_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 10. 订单
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `orderNo`         VARCHAR(255) NOT NULL,
  `userId`          INT NOT NULL,
  `status`          VARCHAR(255) NOT NULL DEFAULT 'unpaid',
  `totalAmount`     INT NOT NULL,
  `addressSnapshot` TEXT NULL,
  `remark`          VARCHAR(255) NULL,
  `paidAt`          DATETIME NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_no` (`orderNo`),
  KEY `idx_order_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 11. 订单明细
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_item` (
  `id`        INT NOT NULL AUTO_INCREMENT,
  `orderId`   INT NOT NULL,
  `productId` INT NOT NULL,
  `name`      VARCHAR(255) NOT NULL,
  `price`     INT NOT NULL,
  `image`     VARCHAR(255) NULL,
  `quantity`  INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_item_order` (`orderId`),
  CONSTRAINT `fk_order_item_order` FOREIGN KEY (`orderId`) REFERENCES `order` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 12. 收货地址
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `address` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `userId`     INT NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `phone`      VARCHAR(255) NOT NULL,
  `province`   VARCHAR(255) NULL,
  `city`       VARCHAR(255) NULL,
  `district`   VARCHAR(255) NULL,
  `detail`     VARCHAR(255) NOT NULL,
  `isDefault`  TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_address_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 13. 优惠券模板
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(255) NOT NULL,
  `type`       VARCHAR(255) NOT NULL DEFAULT 'amount',
  `value`      INT NOT NULL,
  `minSpend`   INT NOT NULL DEFAULT 0,
  `expireAt`   DATETIME NULL,
  `status`     TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 14. 用户领取的优惠券
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_coupon` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `userId`     INT NOT NULL,
  `couponId`   INT NOT NULL,
  `status`     VARCHAR(255) NOT NULL DEFAULT 'unused',
  `usedAt`     DATETIME NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_coupon` (`userId`, `couponId`),
  KEY `idx_user_coupon_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 15. 商品收藏
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `favorite` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `userId`     INT NOT NULL,
  `productId`  INT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_favorite` (`userId`, `productId`),
  KEY `idx_favorite_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 初始化权限点 + admin 角色（与 seed-rbac.ts 一致）
-- =====================================================================
INSERT INTO `permission` (`code`, `name`, `group`) VALUES
  ('user:list',          '查看用户', 'user'),
  ('user:update',        '编辑用户', 'user'),
  ('user:assign-role',   '分配角色', 'user'),
  ('role:list',          '查看角色', 'role'),
  ('role:create',        '新建角色', 'role'),
  ('role:update',        '编辑角色', 'role'),
  ('role:delete',        '删除角色', 'role'),
  ('role:assign-perm',   '分配权限', 'role'),
  ('permission:list',    '查看权限', 'permission'),
  ('permission:create',  '新建权限', 'permission'),
  ('permission:delete',  '删除权限', 'permission')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `group` = VALUES(`group`);

INSERT INTO `role` (`code`, `name`, `is_system`) VALUES ('admin', '超级管理员', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 给 admin 角色挂上全部权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `role` r CROSS JOIN `permission` p
WHERE r.code = 'admin'
ON DUPLICATE KEY UPDATE `role_id` = `role_permissions`.`role_id`;
