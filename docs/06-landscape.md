# 6. Рынок и конкуренты

*Состояние на октябрь 2026.*

## Коротко

Целиком в таком виде, как Gain, этого пока нет. Отдельные куски уже существуют, а крупные компании идут в эту сторону. Ниша, которая пока свободна: **личное, открытое, программируемое** устройство, которое работает с твоим компьютером и твоими агентами, а не держит тебя в экосистеме одной компании.

## Устройства

| Устройство | Компания | Экран | Статус | Чему учит |
|---|---|---|---|---|
| **Безэкранное устройство OpenAI** | OpenAI + Джони Айв | Нет | Отгрузки не раньше конца февраля 2027, от названия «io» отказались | Крупный игрок верит в безэкранный голосовой формат. Скорее всего, будет закрытой экосистемой |
| **Humane AI Pin** | Humane (активы куплены HP) | Нет (проектор на ладонь) | Закрыт: облако отключено 28 февраля 2025 | Попытка заменить смартфон целиком провалилась. Перегрев, тормоза, слабые базовые функции. Устройство без облака превратилось в кирпич |
| **Meta Muse Charm** | Meta | Да, около 2 дюймов | Анонсирован на Connect 2026, выход обещают к декабрю | Ставка на «тамагочи»-персонажа и привычку. Наш подход противоположный: без экрана и без игрушки |
| **Rabbit R1** | Rabbit | Да | Вышел в 2024 | Отдельный ИИ-гаджет с экраном воспринимается как «телефон похуже» |

## Подробнее

### OpenAI и Джони Айв

Безэкранное устройство с голосом на первом месте, которое прямо позиционируют как ответ на зависимость от смартфона. По слухам, в нём есть камеры и микрофоны, а одна из версий похожа на iPod Shuffle на шее. Сообщалось, что OpenAI рассматривала наушники как возможный первый продукт. Выход перенесли: по судебным документам, отгрузки не начнутся раньше конца февраля 2027 года.

**Для нас:** это главный будущий конкурент по форм-фактору. Отличие Gain — открытость, работа с твоим компьютером и любыми агентами, явная модель безопасности.

### Humane AI Pin

Безэкранная прищепка с подпиской, которая должна была заменить смартфон. Компания привлекла около 230 млн долларов, HP купила активы примерно за 116 млн. 28 февраля 2025 года облачный сервис отключили, и устройство перестало работать как ИИ-продукт.

**Уроки:**
1. Не пытаться заменить всё сразу. Узкий фокус.
2. Базовые вещи должны работать безупречно: скорость ответа, батарея, нагрев.
3. Устройство не должно превращаться в кирпич без облака. Отсюда наш офлайн-мозг.

### Meta Muse Charm

Брелок размером с футляр от AirPods, около 2-дюймового сенсорного экрана, 5G, сенсор отпечатка. На экране анимированный персонаж ИИ-ассистента Meta. Критика: телефон уже умеет всё то же, а носить второй гаджет — тяжёлая продажа.

**Для нас:** подтверждает интерес к отдельному карманному устройству для ИИ, но идёт в сторону развлечения и привычки. Gain — инструмент для мышления и работы.

## Инфраструктура

### Наушники с костной проводимостью

Давно на рынке (например, Shokz), недорогие. Наша аудиочасть решена готовыми продуктами.

### Starlink Direct to Cell

Работает с обычным LTE-модемом, без изменений в железе, прошивке и без специальных приложений. Подключение идёт через операторов-партнёров. Данные уже работают для части приложений: у T-Mobile поддерживаются Google Maps, X и WhatsApp на совместимых устройствах, в Японии KDDI запустил передачу данных через au Starlink Direct, Airtel Africa запускает сервис в 14 странах в 2026 году.

**Для нас:** спутник достижим без своей антенны. Нужен оператор-партнёр в нужной стране.

### Быстрые модели-классификаторы (Jev и подобные)

Jev от TypeSafe AI (сентябрь 2026) не генерирует текст, а выбирает из заранее заданных вариантов и даёт вероятность и уверенность. Ответ за 70–500 мс, очень дёшево.

**Для нас:** кандидат на роль быстрого маршрутизатора решений (срочно ли, какому агенту, нужно ли подтверждение).

### Telegram TDLib

Официальная библиотека для создания полноценных клиентов Telegram. Позволяет работать с настоящим аккаунтом, а не ботом.

## Что ещё исследовать

- [ ] Голосовые ИИ-кулоны и записывающие гаджеты (Limitless, Bee, Plaud и подобные): что с ними стало и почему
- [ ] Наушники со встроенным ИИ-ассистентом
- [ ] Операторы-партнёры Starlink Direct to Cell в нужной стране
- [ ] Платёжные брелоки и кольца: кто переносит чип карты и с какими банками работает
- [ ] Модули LTE + NPU для прототипа
- [ ] Локальные модели распознавания и синтеза речи, которые помещаются на мобильный чип

## Источники

- [9to5Mac: Jony Ive's AI hardware is delayed to 2027 and won't be called io](https://9to5mac.com/2026/02/10/jony-ives-ai-hardware-is-delayed-to-2027-and-wont-be-called-io/)
- [Introl: OpenAI Consumer Device](https://introl.com/blog/openai-consumer-device-jony-ive-hardware-2026)
- [CO/AI: OpenAI and Jony Ive develop screenless AI wearable](https://getcoai.com/news/openai-and-jony-ive-develop-screenless-ai-wearable-targeting-2027-launch)
- [PYMNTS: OpenAI Delays First Consumer Device to 2027](https://www.pymnts.com/artificial-intelligence-2/2026/openai-delays-first-consumer-device-to-2027/)
- [WeAreFounders: Humane AI Shuts Down Pin](https://www.wearefounders.uk/humane-ai-shuts-down-pin-a-case-of-hype-over-substance/)
- [Entrepreneur: Humane's Ai Pin](https://www.entrepreneur.com/business-news/humanes-ai-pin-aimed-to-replace-the-iphone-what-happened/)
- [Notebookcheck: Meta launches Muse Charm](https://www.notebookcheck.net/Meta-launches-Muse-Charm-a-Tamagotchi-like-keychain-for-its-AI-agent.1407283.0.html)
- [Techlicious: Meta Muse Charm](https://www.techlicious.com/blog/meta-muse-charm-tamagotchi-ai-wearable/)
- [Starlink Direct to Cell](https://starlink.com/direct-to-cell)
- [Drive Tesla Canada: Starlink adds data support for apps](https://driveteslacanada.ca/news/starlink-expands-t-mobile-direct-to-cell-capabilities-adding-data-support-for-popular-apps/)
- [TechAfricaNews: KDDI Direct-to-Cell data](https://techafricanews.com/2025/08/29/kddi-makes-history-with-direct-to-cell-data-service-via-starlink-satellites/)
- [Reuters via Yahoo: Airtel Africa and Starlink](https://finance.yahoo.com/news/airtel-africa-teams-starlink-launch-171608859.html)
- [Futura-Sciences: Introducing Jev](https://www.futura-sciences.com/en/?p=900220)
- [A Hands-On Guide to Jev](https://levelup.gitconnected.com/a-hands-on-guide-to-jev-69771edd027a)
