"""检查工具协议标记是否误入 Shell 命令，不改写模型生成的命令。"""

_PROTOCOL_MARKERS = (
    "<｜｜DSML｜｜",
    "<｜DSML｜",
    "<｜end▁of▁thinking｜>",
)


def command_validation_error(command: object) -> str | None:
    if not isinstance(command, str) or not command.strip():
        return "command 必须是非空字符串"
    if any(marker in command for marker in _PROTOCOL_MARKERS):
        return "command 混入了 DeepSeek 工具或思考协议标记，请重新生成纯 Shell 命令"
    return None
