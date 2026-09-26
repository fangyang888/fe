
from typing import List,TypedDict

class User(TypedDict):
    id: int
    name: str


def get_user(users: List[User], user_id: int) -> User:
    # for user in users:
    #     if user.id == user_id:
    #         return user
    # return None
    return next((user for user in users if user["id"] == user_id), None)

users:list[User] = [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"},
    {"id": 3, "name": "Charlie"},
    {"id": 1, "name": "Alice"}
]

print(get_user(users, 2))  # 输出: Bob