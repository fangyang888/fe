# src布局、模块和导入

## 当前布局

```text
src/python_agent/
├── api/       HTTP入口
├── core/      配置和日志
├── schemas/   Pydantic数据契约
└── main.py    应用装配
tests/         测试
docs/          学习资料
```

使用`src`布局可以避免测试时意外导入仓库根目录下的同名文件。

## 分层规则

- API层只处理HTTP输入输出。
- Service负责用例编排。
- Domain保存稳定业务规则。
- Repository隐藏数据库细节。
- Infrastructure实现数据库、Redis和模型客户端。
- Schema只描述边界数据，不堆业务逻辑。

依赖应尽量从外层指向内层，领域规则不应该导入FastAPI。

## 练习

画出健康检查请求从`main.py`到路由再到Schema的导入方向，确认不存在循环依赖。

## 验收

能判断一个新函数应该放在哪一层，并能自行解决正常导入问题而不修改`sys.path`。
