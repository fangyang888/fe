

orders = [
    {"id": 1, "user": "Tom", "price": 120, "status": "paid"},
    {"id": 2, "user": "Jack", "price": 80, "status": "cancelled"},
    {"id": 3, "user": "Lucy", "price": 230, "status": "paid"},
    {"id": 4, "user": "Tom", "price": 60, "status": "paid"},
    {"id": 5, "user": "Rose", "price": 300, "status": "paid"},
]

results = sum(y['price'] for y in sorted([x for x in orders if x['status'] == 'paid'], key=lambda x: x['price'], reverse=True)[0:3])

print(len([x for x in orders if x['status'] == 'paid']))

print(results)

