require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'fangyang6579',
    database: process.env.DB_NAME || 'fe_prediction',
  });

  const files = ['lottery_2023.json', 'lottery_2024.json', 'lottery_2025.json', 'lottery_2026.json'];

  let totalInserted = 0;

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${file}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // json文件中通常是最新日期在最前面，为了按照时间先后顺序插入，这里做一下反转 (oldest first)
    data.reverse(); 

    console.log(`Processing ${file}, found ${data.length} records.`);

    for (const record of data) {
      // 解析年份，从 date (例如 "2026-04-28") 提取
      const year = parseInt(record.date.split('-')[0], 10);
      
      // 解析期数，从 event (例如 "第118期") 提取
      const eventMatch = record.event.match(/第(\d+)期/);
      const no = eventMatch ? parseInt(eventMatch[1], 10) : 0;

      // 解析号码
      const [n1, n2, n3, n4, n5, n6, n7] = record.items;

      // 查询是否已存在，防止重复插入
      const [rows] = await connection.execute(
        'SELECT id FROM history WHERE year = ? AND No = ?',
        [year, no]
      );

      if (rows.length === 0) {
        await connection.execute(
          `INSERT INTO history (n1, n2, n3, n4, n5, n6, n7, year, No) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [n1, n2, n3, n4, n5, n6, n7, year, no]
        );
        totalInserted++;
      }
    }
  }

  console.log(`Finished inserting data. Total inserted: ${totalInserted}`);
  await connection.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
