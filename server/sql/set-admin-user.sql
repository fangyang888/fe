-- =====================================================================
-- 给 user id=1 设置后台账号密码（admin / admin123），并挂 admin 角色
-- 密码为 scrypt 哈希(salt:hash)，与后端 password.util 一致，可直接登录。
-- 用法: mysql -u root -p fe_prediction < server/sql/set-admin-user.sql
-- =====================================================================

-- 若 user 表缺列，先补上（已存在则忽略报错）
ALTER TABLE `user` ADD COLUMN `username` VARCHAR(255) NULL UNIQUE;
ALTER TABLE `user` ADD COLUMN `password` VARCHAR(255) NULL;

-- 设置账号密码（admin / admin123）
UPDATE `user`
SET `username` = 'admin',
    `password` = 'f641214f1d9ef15f1fffe1672919cb4e:516b2a99ecccaa09b4a05420137a2358e841786c86eb6e4d079b6e3c8899927a6ce38a1e9ba884260715feeec9f0157562556107c96e2dd4848e08b8bfc33018',
    `status` = 1
WHERE `id` = 1;

-- 确保挂上 admin 角色
INSERT INTO `user_roles` (`user_id`, `role_id`)
SELECT 1, r.id FROM `role` r WHERE r.code = 'admin'
ON DUPLICATE KEY UPDATE `user_id` = `user_roles`.`user_id`;

SELECT id, username, status FROM `user` WHERE id = 1;
