-- 为每期 7 个号码按 n1..n7 顺序保存颜色和生肖。
ALTER TABLE `history`
  ADD COLUMN IF NOT EXISTS `number_infos` JSON NULL AFTER `No`;
