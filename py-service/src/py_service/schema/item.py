from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50, title="商品名称", description="商品的名称，长度在1到50个字符之间")
    quantity: int = Field(gt=0)
    in_stock: bool = True