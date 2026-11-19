from fastapi import FastAPI
from py_service.schema.item import ItemCreate


app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/hello")
async def hello(name: str = "World"):
    return {"message": f"Hello {name}"}




@app.post("/items",description="创建一个新的商品")
def create_item(item: ItemCreate):
    return item