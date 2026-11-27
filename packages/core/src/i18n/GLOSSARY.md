# Glossary and tone

For whoever translates Vitto's strings. The catalogs are `es.json` and
`zh-Hans.json`, keyed by the English.

## Tone

Vitto is a health app with a virtual pet: warm, plain, a little playful, never
clinical and never salesy. The pet speaks in the first person, like a small
friend texting.

- **Spanish (`es`)**: neutral Latin American Spanish that reads naturally in
  Spain too. Informal `tú`, never `usted` or `vosotros`. Sentence case, not
  English title case ("Registrar comida", not "Registrar Comida"). Opening
  `¿` and `¡`. Keep it as short as the meaning allows: buttons and labels
  have little room.
- **Simplified Chinese (`zh-Hans`)**: mainland usage, friendly and plain,
  `你` not `您`. Full-width punctuation (，。！？：) in sentences; no space
  between Chinese and a number or placeholder unless a Latin word needs one.
  Labels and buttons are short (two to four characters where natural).

## Rules

- Keep every `{placeholder}` exactly as written; move it wherever the
  sentence needs it. Never translate what is inside the braces.
- A key may end in `||some context`. The context says which meaning is
  intended; translate only the part before `||`.
- Keys that are the singular and plural of one phrase (`{count} coin`,
  `{count} coins`): Spanish translates each; Chinese gives both the same
  translation.
- A string written in capitals in English (`TODAY`, `SAVE 50%`) is a small
  label: capitals in Spanish (`HOY`), plain in Chinese (`今天`).
- Do not translate: `Vitto`, `Vitto Plus`, `Plus` (the plan), `Apple Health`,
  `App Store`, `FatSecret`, `USDA`, unit symbols (`kcal`, `g`, `kg`, `lb`,
  `km`, `mi`), `XP`, emoji, and symbols such as `✓ · — ×`.
- Keep line breaks (`\n`) and leading or trailing spaces as they are.
- Use the same translation for the same term everywhere. The table below is
  fixed; for anything else, pick one and stay with it.

## Fixed terms

| English | Spanish | Simplified Chinese |
|---|---|---|
| pet | mascota | 宠物 |
| coins | monedas | 金币 |
| level | nivel | 等级 |
| streak | racha | 连续打卡 |
| streak freeze | protector de racha | 连续保护 |
| Health (pet stat) | Salud | 健康 |
| Vitality | Vitalidad | 活力 |
| Energy | Energía | 精力 |
| Happiness | Felicidad | 快乐 |
| Hunger | Hambre | 饱腹 |
| Strength | Fuerza | 力量 |
| Endurance | Resistencia | 耐力 |
| Recovery | Recuperación | 恢复 |
| Mind | Mente | 脑力 |
| Living room | Sala | 客厅 |
| Kitchen | Cocina | 厨房 |
| Gym | Gimnasio | 健身房 |
| Outdoors / Outside | Exterior | 户外 |
| Study | Estudio | 书房 |
| Home (tab) | Inicio | 首页 |
| Food (tab) | Comida | 饮食 |
| Today | Hoy | 今天 |
| Shop | Tienda | 商店 |
| Friends | Amigos | 好友 |
| Settings | Ajustes | 设置 |
| Profile | Perfil | 个人资料 |
| meal | comida | 餐食 |
| Log meal | Registrar comida | 记录饮食 |
| log (verb) | registrar | 记录 |
| workout | entrenamiento | 训练 |
| set (of an exercise) | serie | 组 |
| rep | repetición (rep.) | 次 |
| steps | pasos | 步数 / 步 |
| calories | calorías | 卡路里 / 热量 |
| protein / carbs / fat / fiber | proteína / carbohidratos / grasa / fibra | 蛋白质 / 碳水 / 脂肪 / 膳食纤维 |
| macros | macros | 营养素 |
| serving | porción | 份 |
| barcode | código de barras | 条形码 |
| free trial | prueba gratis | 免费试用 |
| Free (the plan) | Gratis | 免费版 |
| Restore (purchases) | Restaurar | 恢复购买 |
| Terms of Use / Privacy Policy | Términos de uso / Política de privacidad | 使用条款 / 隐私政策 |
| check-in (the pet reaching out) | saludo | 问候 |
| personality | personalidad | 性格 |
| Runner / Lifter / Scholar / Balanced (forms) | Corredor / Levantador / Erudito / Equilibrado | 跑者 / 举重者 / 学者 / 均衡 |
| reaction (to a friend) | reacción | 互动 |
| High five / Cheer on / Proud of you / Nudge | Choca esos cinco / Ánimo / Orgullo de ti / Toquecito | 击掌 / 加油 / 为你骄傲 / 戳一下 |
| Report or block | Reportar o bloquear | 举报或拉黑 |
