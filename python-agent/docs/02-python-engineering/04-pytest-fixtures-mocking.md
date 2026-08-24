# pytest、fixture和mock

## 测试层次

- 单元测试：一个函数或类，外部依赖使用fake/mock。
- 集成测试：连接真实MySQL或Redis测试协作行为。
- 接口测试：通过HTTP调用FastAPI。
- 契约测试：保证Python和TypeScript的输入输出一致。

## pytest重点

学习普通断言、异常断言、参数化、fixture、作用域、monkeypatch和异步测试。

```python
import pytest

@pytest.mark.parametrize(("left", "right", "expected"), [(1, 2, 3), (-1, 1, 0)])
def test_add(left: int, right: int, expected: int) -> None:
    assert left + right == expected
```

Mock只放在系统边界，例如模型网关、时间和第三方API；不要把被测核心逻辑本身mock掉。

## 练习

为健康接口增加测试环境配置fixture，并验证响应绝不包含数据库URL或API Key。

## 验收

每个功能至少覆盖正常、边界、异常三个方向，失败时测试名称能说明业务行为。
