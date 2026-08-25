---
schema_version: 1
recipe_id: kebab-case-id
version: 1
status: draft
name: 菜名（≤30字）
summary: 一句话摘要，帮助检索命中（≤200字）
servings: 2
prep_minutes: 10
cook_minutes: 15
meal_types:
  - lunch
  - dinner
difficulty: medium
equipment:
  - wok
tags:
  - tag1
dietary_labels: []
allergens: []
ingredients:
  - id: ingredient_id
    name: 食材中文名
    quantity: 100
    unit: g
    preparation: 切法或预处理（可省略）
    role: primary # primary | supporting | seasoning | garnish | cooking_medium（可省略，不确定就不填，不要瞎猜）
    optional: false # 能否整体省略（可省略字段本身，不确定就不填）
    defines_dish: false # 换掉/去掉后是否就变成另一道菜了（可省略字段本身，不确定就不填；true 时换菜应通过 relations/ 的 variant_of 表达，不是这里的 substitutions）
source:
  name: 自有菜谱
  url: null
---
# 菜名

## 做法

1. 第一步。
2. 第二步。

## 替换建议

- 缺货/忌口时的替换或省略建议；写明适用条件，不写“通常便宜”这类结论。

## 储存与安全

- 保存条件、保存期限、复热或食用安全提醒。
