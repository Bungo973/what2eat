---
schema_version: 1
catalog_version: 2
updated_at: 2026-08-24
ingredients:
  - id: tomato
    canonical_name: 番茄
    aliases: [西红柿, 洋柿子]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [番茄]
        unit_hint: 斤
      - source: pfsc
        terms: [西红柿]
        external_id: "135"
        unit_hint: 公斤
  - id: potato
    canonical_name: 土豆
    aliases: [马铃薯, 洋芋]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [土豆]
        unit_hint: 斤
      - source: pfsc
        terms: [土豆]
        external_id: "101"
        unit_hint: 公斤
  - id: green_pepper
    canonical_name: 青椒
    aliases: [尖椒, 柿子椒]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [青椒]
        unit_hint: 斤
      - source: pfsc
        terms: [青椒]
        external_id: "137"
        unit_hint: 公斤
  - id: broccoli
    canonical_name: 西兰花
    aliases: [绿花菜]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [西兰花]
        unit_hint: 斤
      - source: pfsc
        terms: [西兰花]
        external_id: "130"
        unit_hint: 公斤
  - id: cucumber
    canonical_name: 黄瓜
    aliases: [青瓜]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [黄瓜]
        unit_hint: 斤
      - source: pfsc
        terms: [黄瓜]
        external_id: "139"
        unit_hint: 公斤
  - id: choy_sum
    canonical_name: 菜心
    aliases: [菜苔]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [菜心]
        unit_hint: 斤
      - source: jiangnan
        terms: [菜心]
        unit_hint: 公斤
      - source: pfsc
        terms: [菜苔]
        external_id: "118"
        unit_hint: 公斤
  - id: chinese_cabbage
    canonical_name: 大白菜
    aliases: [白菜]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [大白菜]
        unit_hint: 斤
      - source: pfsc
        terms: [大白菜]
        external_id: "77"
        unit_hint: 公斤
  - id: winter_melon
    canonical_name: 冬瓜
    aliases: []
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [冬瓜]
        unit_hint: 斤
      - source: pfsc
        terms: [冬瓜]
        external_id: "143"
        unit_hint: 公斤
  - id: carrot
    canonical_name: 胡萝卜
    aliases: [红萝卜]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [胡萝卜]
        unit_hint: 斤
      - source: pfsc
        terms: [胡萝卜]
        external_id: "100"
        unit_hint: 公斤
  - id: onion
    canonical_name: 洋葱
    aliases: []
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [洋葱]
        unit_hint: 斤
  - id: shiitake
    canonical_name: 香菇
    aliases: [冬菇]
    category: vegetable
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [香菇]
        unit_hint: 斤
      - source: pfsc
        terms: [香菇]
        external_id: "1244"
        unit_hint: 公斤
  - id: wood_ear
    canonical_name: 木耳
    aliases: [黑木耳, 干木耳, 云耳]
    category: vegetable
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [木耳]
        unit_hint: 斤
  - id: tofu
    canonical_name: 豆腐
    aliases: [北豆腐, 南豆腐, 嫩豆腐]
    category: other
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: [soy]
    price_query_terms:
      - source: xinfadi
        terms: [豆腐]
        unit_hint: 斤
  - id: banana
    canonical_name: 香蕉
    aliases: []
    category: fruit
    default_purchase_unit: 斤
    conversions:
      - { from_unit: piece, to_unit: g, factor: 120, approximate: true }
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [香蕉]
        unit_hint: 斤
      - source: pfsc
        terms: [香蕉]
        external_id: "209"
        unit_hint: 公斤
  - id: pork_belly
    canonical_name: 五花肉
    aliases: [猪五花, 五花]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [五花肉]
        preferred_specs: [瘦]
        unit_hint: 斤
  - id: pork_ribs
    canonical_name: 排骨
    aliases: [肋排, 猪小排]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [肋排, 排骨]
        unit_hint: 斤
  - id: ground_pork
    canonical_name: 猪肉末
    aliases: [肉末, 肉馅]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: pork_loin
    canonical_name: 猪里脊
    aliases: [里脊肉, 里脊, 猪瘦肉]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [里脊]
        unit_hint: 斤
  - id: chicken_wings
    canonical_name: 鸡翅
    aliases: [鸡中翅]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [鸡翅]
        unit_hint: 斤
  - id: chicken_breast
    canonical_name: 鸡胸肉
    aliases: [鸡胸]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [鸡胸]
        unit_hint: 斤
  - id: chicken_thigh
    canonical_name: 鸡腿肉
    aliases: [鸡腿, 去骨鸡腿肉, 琵琶腿]
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [鸡腿]
        unit_hint: 斤
  - id: beef_brisket
    canonical_name: 牛腩
    aliases: []
    category: meat
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [牛腩]
        unit_hint: 斤
      - source: pfsc
        terms: [牛肉]
        unit_hint: 公斤
  - id: sea_bass
    canonical_name: 鲈鱼
    aliases: [淡水鲈鱼]
    category: aquatic
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: [fish]
    price_query_terms:
      - source: xinfadi
        terms: [鲈鱼]
        preferred_specs: [淡水]
        unit_hint: 斤
      - source: pfsc
        terms: [鲈鱼]
        external_id: "1031"
        unit_hint: 公斤
  - id: egg
    canonical_name: 鸡蛋
    aliases: [土鸡蛋, 洋鸡蛋]
    category: egg_dairy
    default_purchase_unit: 斤
    conversions:
      - { from_unit: piece, to_unit: g, factor: 50, approximate: true }
    allergen_tags: [egg]
    price_query_terms:
      - source: xinfadi
        terms: [鸡蛋]
        unit_hint: 斤
      - source: pfsc
        terms: [鸡蛋]
        external_id: "972"
        unit_hint: 公斤
  - id: milk
    canonical_name: 牛奶
    aliases: [纯牛奶]
    category: egg_dairy
    default_purchase_unit: ml
    conversions: []
    allergen_tags: [milk]
    price_query_terms: []
  - id: rice
    canonical_name: 大米
    aliases: [粳米]
    category: grain
    default_purchase_unit: kg
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [大米]
        unit_hint: 斤
      - source: pfsc
        terms: [大米]
        external_id: "6"
        unit_hint: 公斤
  - id: flour
    canonical_name: 面粉
    aliases: [中筋面粉]
    category: grain
    default_purchase_unit: kg
    conversions: []
    allergen_tags: [wheat]
    price_query_terms:
      - source: xinfadi
        terms: [面粉]
        unit_hint: 斤
      - source: pfsc
        terms: [面粉]
        external_id: "2"
        unit_hint: 公斤
  - id: oatmeal
    canonical_name: 燕麦片
    aliases: [燕麦]
    category: grain
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: millet
    canonical_name: 小米
    aliases: [黄小米, 小黄米]
    category: grain
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [小米]
        unit_hint: 斤
  - id: dried_noodles
    canonical_name: 挂面
    aliases: [面条]
    category: grain
    default_purchase_unit: g
    conversions: []
    allergen_tags: [wheat]
    price_query_terms: []
  - id: cornstarch
    canonical_name: 淀粉
    aliases: [玉米淀粉, 生粉]
    category: grain
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: cooking_oil
    canonical_name: 食用油
    aliases: [植物油]
    category: oil_condiment
    default_purchase_unit: l
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: salt
    canonical_name: 盐
    aliases: [食盐]
    category: oil_condiment
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [食盐]
        unit_hint: 斤
  - id: sugar
    canonical_name: 白糖
    aliases: [砂糖]
    category: oil_condiment
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: soy_sauce
    canonical_name: 生抽
    aliases: [酱油]
    category: oil_condiment
    default_purchase_unit: ml
    conversions: []
    allergen_tags: [soy, wheat]
    price_query_terms: []
  - id: vinegar
    canonical_name: 香醋
    aliases: [醋, 陈醋]
    category: oil_condiment
    default_purchase_unit: ml
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: cooking_wine
    canonical_name: 料酒
    aliases: [黄酒]
    category: oil_condiment
    default_purchase_unit: ml
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: doubanjiang
    canonical_name: 豆瓣酱
    aliases: [郫县豆瓣酱]
    category: oil_condiment
    default_purchase_unit: g
    conversions: []
    allergen_tags: [soy, wheat]
    price_query_terms: []
  - id: sesame_oil
    canonical_name: 香油
    aliases: [麻油, 芝麻油]
    category: oil_condiment
    default_purchase_unit: ml
    conversions: []
    allergen_tags: [sesame]
    price_query_terms: []
  - id: oyster_sauce
    canonical_name: 蚝油
    aliases: []
    category: oil_condiment
    default_purchase_unit: g
    conversions: []
    allergen_tags: [shellfish]
    price_query_terms: []
  - id: cola
    canonical_name: 可乐
    aliases: [可口可乐]
    category: other
    default_purchase_unit: ml
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: scallion
    canonical_name: 大葱
    aliases: [葱白]
    category: spice
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [大葱]
        unit_hint: 斤
      - source: pfsc
        terms: [大葱]
        external_id: "105"
        unit_hint: 公斤
  - id: ginger
    canonical_name: 姜
    aliases: [生姜]
    category: spice
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [生姜, 姜]
        unit_hint: 斤
      - source: pfsc
        terms: [生姜]
        external_id: "106"
        unit_hint: 公斤
  - id: garlic
    canonical_name: 蒜
    aliases: [大蒜, 蒜头]
    category: spice
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [大蒜, 蒜]
        unit_hint: 斤
      - source: pfsc
        terms: [大蒜]
        external_id: "107"
        unit_hint: 公斤
  - id: dried_chili
    canonical_name: 干辣椒
    aliases: [辣椒干]
    category: spice
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: pfsc
        terms: [辣椒干]
        external_id: "1327"
        unit_hint: 公斤
  - id: sichuan_peppercorn
    canonical_name: 花椒
    aliases: [川椒]
    category: spice
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: white_pepper
    canonical_name: 白胡椒
    aliases: [白胡椒粉]
    category: spice
    default_purchase_unit: g
    conversions: []
    allergen_tags: []
    price_query_terms: []
  - id: corn_peanut_mix
    canonical_name: 熟花生米
    aliases: [花生米, 炸花生]
    category: other
    default_purchase_unit: g
    conversions: []
    allergen_tags: [peanut]
    price_query_terms: []
  - id: cilantro
    canonical_name: 香菜
    aliases: [芫荽]
    category: spice
    default_purchase_unit: 斤
    conversions: []
    allergen_tags: []
    price_query_terms:
      - source: xinfadi
        terms: [香菜]
        unit_hint: 斤
      - source: pfsc
        terms: [香菜]
        external_id: "86"
        unit_hint: 公斤
---

## 说明

标准食材目录（PRD §9.4）。YAML frontmatter 为机器事实源；正文仅作维护说明。

- 价格查询词按源维护：`xinfadi` 单位为元/斤，`jiangnan`/`pfsc` 单位为元/公斤。
- `conversions` 中 `approximate: true` 的换算（如鸡蛋 1 个≈50g）在采购汇总时必须产生近似警告。
- 过敏原标签在菜谱发布时自动复核（frontmatter allergens 与食材目录并集）。
