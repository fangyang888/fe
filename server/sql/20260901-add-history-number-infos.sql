-- 为每期 7 个号码按 n1..n7 顺序保存颜色和生肖。
SET @number_infos_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'history'
    AND COLUMN_NAME = 'number_infos'
);

SET @number_infos_sql = IF(
  @number_infos_exists = 0,
  'ALTER TABLE `history` ADD COLUMN `number_infos` JSON NULL AFTER `No`',
  'SELECT ''history.number_infos already exists'' AS migration_status'
);

PREPARE number_infos_statement FROM @number_infos_sql;
EXECUTE number_infos_statement;
DEALLOCATE PREPARE number_infos_statement;
