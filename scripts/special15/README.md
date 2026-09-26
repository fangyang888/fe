# 特别码 Top-15 离线实验

只读取指定年份的历史开奖，以当期之前的数据预测当期 `n7`，每期固定选择 15 个不同号码。默认年份为 2026，不使用其他年份做预训练或计算特征。无需额外依赖，Node.js 18 或更高版本即可运行。

```sh
# 离线快照
node scripts/special15/run.mjs --input /path/to/history.json --year 2026 --out analysis/special15-2026

# 已运行的后端（只发 GET 请求，自动添加 year 参数）
node scripts/special15/run.mjs --url http://127.0.0.1:3000/api/history --year 2026 --out analysis/special15-2026-new

# 验证算法、年份隔离与未来数据隔离
node --test scripts/special15/model.test.mjs
```

输入必须是 `/api/history` 的数组结构：`year`、`No`、`n1`～`n7`。脚本先过滤年份，按期号排序，去除完全相同的重复记录；冲突记录、无效号码和中间缺期会报错，不静默修复。保留原来的号码位置。

至少需要同一年连续 210 期。前 30 期作为特征预热，最后 120 期固定分成验证 60 期、最终测试 60 期，其余用于训练。对于当前 266 期数据，训练范围为 1～146，验证 147～206，测试 207～266。小样本下，30/100 期窗口会按实际可用历史计算。

预设六个配置：平滑频率的 30/100 期窗口、逻辑回归的两种 L2 强度、KNN 的 15/30 个邻居。所有方法最后都取 Top-15。逻辑回归是共享参数的候选号码二分类评分器，不把 49 个候选视为 49 期独立开奖；分数不宣称为已校准概率。KNN 的 K 是邻居数量，与输出候选数量 15 是两个概念。

仅根据验证段命中次数选择配置，并列按声明顺序。测试段严格先预测再学习已揭晓的开奖结果，参数不根据测试成绩重选。其他配置的测试成绩作为诊断输出，不能用其事后最优结果替换预先选定模型。随机对照是独立均匀开奖下 `15/49` 的理论基线；提供 Wilson 区间及固定模型的单侧二项检验。

输出目录必须为空，以保护已有实验。生成报告、完整 JSON、逐期 CSV、下一期候选和仅含本年度的快照。协议及数据、代码 SHA-256 在计算成绩之前保存。复现时使用同一份快照，模型和预测结果确定不变，读取时间和输出路径除外。

新增数据后重跑会改变划分，属于新实验，不能当作同一固定测试的延长。这个工具是离线实验，不提供前瞻成绩账本；未来需要在开奖前保存候选并固定配置，开奖后核对。历史结果也可能已被仓库其他策略研究使用过，因此不能称作整个项目从未看过的数据。

方法参考：[KNN](https://scikit-learn.org/stable/modules/neighbors.html)、[时间顺序验证](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)、[Top-K 指标](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.top_k_accuracy_score.html)。本实现不依赖 scikit-learn。
