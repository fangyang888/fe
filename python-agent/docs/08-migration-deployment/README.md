# 第8章：双轨迁移和部署

目标：在不中断现有系统的前提下，把`/api/agent/*`安全迁移到Python。

1. [双轨、影子流量与结果对比](./01-shadow-comparison.md)
2. [Nginx路由、灰度和回滚](./02-nginx-canary-rollback.md)
3. [Docker与CI](./03-docker-ci.md)
4. [生产检查清单](./04-production-checklist.md)

通过标准：能按5%→20%→50%→100%逐步切换，并在任一阶段快速回到NestJS版本。
