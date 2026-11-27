本手册用于指导工程师完成设备安装、参数核对与 SDK 接入。

# 安装指南

安装前请先确认供电环境和防护等级要求：

| 型号 | 功率 | 防护 |
| --- | --- | --- |
| A100 | 10 W | IP54 |
| A200 | 20 W | IP65 |
| A300 | 30 W | IP67 |

> 注意：户外场景请至少选择 IP65 及以上型号。

![设备接线示意图](images/wiring.png "标准接线图")

## 快速启动代码

下面演示如何用 Python 调用初始化函数：

```python
def init_device(model: str) -> str:
    return f"Device {model} ready"

print(init_device("A200"))
```

### 常见检查项

- 确认电源线连接牢固
- 确认指示灯呈绿色常亮

# 故障排查

若设备无法上线，请先检查网络配置。
