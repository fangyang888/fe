const fs = require('fs');
const path = require('path');

const files = ['test_2024.json', 'test_2025.json', 'test_2026.json'];
const API_URL = 'http://localhost:3000/api/hk/history';

async function importData() {
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${file}`);
      continue;
    }
    
    console.log(`\n=== Reading ${file}... ===`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const records = data.records || [];
    
    // 按日期升序排序（按时间先后顺序插入）
    records.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    for (const record of records) {
      if (!record.items || record.items.length !== 7) {
        console.log(`Skipping invalid record: ${record.date} (items length: ${record.items ? record.items.length : 0})`);
        continue;
      }
      
      const year = parseInt(record.date.split('-')[0], 10);
      const No = parseInt(record.event.replace(/\D/g, ''), 10);
      
      const payload = {
        numbers: record.items,
        year: year,
        No: No
      };
      
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          console.error(`Failed to insert ${record.date} (No: ${No}):`, await response.text());
        } else {
          console.log(`Inserted ${record.date} (No: ${No}, Year: ${year})`);
        }
      } catch (err) {
        console.error(`Error inserting ${record.date}:`, err.message);
      }
    }
  }
  console.log('\nImport completed.');
}

importData();
