const fs = require('fs');
const path = require('path');

// 备份并修改文件函数
function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.error(`文件未找到: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 备份
  const backupPath = filePath + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content, 'utf8');
    console.log(`已备份 ${path.basename(filePath)} 到 ${path.basename(backupPath)}`);
  }
  
  let modified = false;
  for (const r of replacements) {
    if (content.includes(r.target)) {
      if (content.includes(r.replacement)) {
        console.log(`文件 ${path.basename(filePath)} 已存在补丁: ${r.target.slice(0, 30).trim()}...`);
        continue;
      }
      content = content.replace(r.target, r.replacement);
      modified = true;
    } else {
      console.warn(`未匹配到目标文字: "${r.target.trim()}" 在文件 ${path.basename(filePath)} 中`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`成功应用补丁到: ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

// 1. 注册后端 PredictorModule
const modulePath = path.join(__dirname, 'server', 'src', 'predictor', 'predictor.module.ts');
const modulePatches = [
  {
    target: "import { PredictorOptService } from './predictor-opt.service';",
    replacement: `import { PredictorOptService } from './predictor-opt.service';
import { PredictorKill2Controller } from './predictor-kill2.controller';
import { PredictorKill2Service } from './predictor-kill2.service';`
  },
  {
    target: "controllers: [PredictorController, PredictorOptController],",
    replacement: "controllers: [PredictorController, PredictorOptController, PredictorKill2Controller],"
  },
  {
    target: "providers: [PredictorService, PredictorOptService],",
    replacement: "providers: [PredictorService, PredictorOptService, PredictorKill2Service],"
  }
];

// 2. 注册前端 Routes in main.tsx
const mainPath = path.join(__dirname, 'src', 'main.tsx');
const mainPatches = [
  {
    target: "import HistoryManager from './HistoryManager.jsx';",
    replacement: `import HistoryManager from './HistoryManager.jsx';
// @ts-ignore
import KillTwoPredictor from './KillTwoPredictor.jsx';`
  },
  {
    target: `<Route path="/history" element={<HistoryManager />} />`,
    replacement: `<Route path="/history" element={<HistoryManager />} />
      <Route path="/kill/two" element={<KillTwoPredictor />} />`
  }
];

// 3. 在 NewKillPredictor.jsx 插入入口链接
const newKillPath = path.join(__dirname, 'src', 'NewKillPredictor.jsx');
const newKillPatches = [
  {
    target: `<a href="/fe/kill/math3" className="btn-back" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', border: 'none' }}>数学排除预测 (95%+)</a>`,
    replacement: `<a href="/fe/kill/math3" className="btn-back" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', border: 'none' }}>数学排除预测 (95%+)</a>
          <a href="/fe/kill/two" className="btn-back" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', border: 'none', marginLeft: '10px' }}>100% 滚动2排除</a>`
  }
];

// 4. 在 KillPredictorHK.jsx 插入入口链接
const killHkPath = path.join(__dirname, 'src', 'KillPredictorHK.jsx');
const killHkPatches = [
  {
    target: `<a href="/fe/kill/math3" style={{ ...styles.backLink, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#fff', border: 'none' }}>`,
    replacement: `<a href="/fe/kill/two" style={{ ...styles.backLink, background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: '#fff', border: 'none', marginRight: '8px' }}>
          100% 滚动2排除
        </a>
        <a href="/fe/kill/math3" style={{ ...styles.backLink, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#fff', border: 'none' }}>`
  }
];

console.log('--- 开始应用项目集成补丁 ---');
const b1 = patchFile(modulePath, modulePatches);
const b2 = patchFile(mainPath, mainPatches);
const b3 = patchFile(newKillPath, newKillPatches);
const b4 = patchFile(killHkPath, killHkPatches);
console.log('--- 补丁应用结束 ---');
