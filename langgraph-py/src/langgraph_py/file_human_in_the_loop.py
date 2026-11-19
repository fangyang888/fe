
from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph_py.deepagent import load_model
from langgraph.checkpoint.memory import InMemorySaver

@tool
def write_file(fileName: str) -> str:
    """
     模拟写入文件的工具函数，返回文件的绝对路径。
    """
  
    return f"已写入文件: {fileName}"

@tool
def read_file(fileName: str) -> str:
    """
    模拟读取文件的工具函数，返回文件的内容。
    """
    return f"读取文件: {fileName} 的内容"

model = load_model()

config = {
    "configurable": {
        "thread_id": "my_thread_id"
    }
}

graph = create_deep_agent(model=model, 
                               tools=[write_file, read_file],
                               system_prompt="你是一个模拟文件操作助手，你都要调用write_file和read_file工具来进行文件操作。",
                               interrupt_on={
                                   "write_file": {
                                       "allowed_decisions": ["approve", "reject"],
                                       "description": "写入文件操作需要用户确认，是否继续执行？"
                                      
                                   },
                                   "read_file": {
                                       "allowed_decisions": ["approve", "reject"],
                                       "description": "读取文件操作需要用户确认，是否继续执行？"
                                   }
                               }
                            )