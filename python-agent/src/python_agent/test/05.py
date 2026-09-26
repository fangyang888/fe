import asyncio

semaphore = asyncio.Semaphore(3)

async def call_llm(text):
    async with semaphore:
        print("开始:", text)

        await asyncio.sleep(2)

        return f"结果:{text}"

async def main():
    texts = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F"
    ]

    results = await asyncio.gather(
       * [call_llm(text) for text in texts]
    )

    print(results)

asyncio.run(main())