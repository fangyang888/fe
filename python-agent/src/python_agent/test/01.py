# n = 1
# result = 0
# while n <= 5:
#     if n % 2 == 0:
#         result += n
#     else:
#         result -= n
#     n += 1
# print(result)

# num = 1
# while num <= 10:
#     if num == 3:
#         num += 1
#         continue
#     if num == 7:
#         break
#     print(num)
#     num += 1

# i = 0
# while i < 3:
#     print(i)
#     i += 1
# else:
#     print("end")

# height = float(input('请输入您的身高（米）:'))
# weight = float(input('请输入您的体重（公斤）:'))

# bmi = weight / (height ** 2)

# if bmi < 18.5:
#     print('您的体重过轻')
# elif 18.5 <= bmi < 24:
#     print('您的体重正常')
# elif 24 <= bmi < 28:
#     print('您的体重过重')
# else:
#     print('您的体重肥胖')


# nums = [3, 1, 4, 1, 5]
# copy = nums[:]
# print(nums == copy, nums is copy)

d = {"x": 10, "y": 20}
d["z"] = 30
d.update({"x": 15})
print(len(d))
print("x" in d, 20 in d)
print(d.get("w", 0))