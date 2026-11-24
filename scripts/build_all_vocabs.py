#!/usr/bin/env python3
"""
Собирает и валидирует обе чистые базы:
- slovak-studio/data/vocab-sk.json (515 проверенных словацких слов с визуальными иконками)
- slovak-studio/data/vocab-en.json (160 проверенных базовых английских слов с общими визуальными иконками)
"""

import json
import re
from pathlib import Path
from build_clean_vocab import EXTRA_BRATISLAVA_WORDS
from vocab_expansion_pack import EXPANSION_WORDS

ROOT = Path(__file__).resolve().parents[2]
INDEX_HTML = ROOT / "index.html"
OUT_SK = ROOT / "slovak-studio" / "data" / "vocab-sk.json"
OUT_EN = ROOT / "slovak-studio" / "data" / "vocab-en.json"

CAT_ICONS = {
    "ВНЖ и документы": "🛂",
    "Жильё и аренда": "🏠",
    "Университет и учёба": "🎓",
    "Ложные друзья": "⚠️",
    "Глаголы": "⚡",
    "Город и транспорт": "🚋",
    "Супермаркет и быт": "🛒",
    "Прилагательные": "🎨",
    "Наречия и время": "⏱️",
    "Медицина и здоровье": "🩺",
    "Кафе и еда": "☕",
    "Банки и финансы": "🏦",
    "Школа и дети": "🎒",
    "Нострификация и кадастр": "📜",
    "Разговорные фразы": "💬",
    "Время и числа": "🗓️",
}

WORD_VISUALS = {
    "pas": "📘", "passport": "📘", "byt": "🏢", "apartment": "🏢", "kľúč": "🔑", "key": "🔑",
    "výťah": "🛗", "elevator": "🛗", "balkón": "🌇", "balcony": "🌇", "kuchyňa": "🍳", "kitchen": "🍳",
    "električka": "🚋", "tram": "🚋", "autobus": "🚌", "bus": "🚌", "vlak": "🚆", "train": "🚆",
    "letisko": "✈️", "airport": "✈️", "lístok": "🎫", "ticket": "🎫", "bicykel": "🚲", "bicycle": "🚲",
    "chlieb": "🍞", "bread": "🍞", "mlieko": "🥛", "milk": "🥛", "syr": "🧀", "cheese": "🧀",
    "jahoda": "🍓", "strawberry": "🍓", "jablko": "🍎", "apple": "🍎", "voda": "💧", "water": "💧",
    "ryba": "🐟", "fish": "🐟", "vajcia": "🥚", "eggs": "🥚", "mäso": "🥩", "meat": "🥩",
    "lekár": "👨‍⚕️", "doctor": "👨‍⚕️", "lekáreň": "💊", "pharmacy": "💊", "horúčka": "🌡️", "fever": "🌡️",
    "zubár": "🦷", "dentist": "🦷", "sanitka": "🚑", "ambulance": "🚑", "liek": "💊", "medicine": "💊",
    "stôl": "🪑", "table": "🪑", "stolička": "🪑", "chair": "🪑", "hrad": "🏰", "castle": "🏰",
    "bankomat": "🏧", "atm": "🏧", "platobná karta": "💳", "credit card": "💳", "hotovosť": "💶", "cash": "💶",
    "chladnička": "🧊", "fridge": "🧊", "práčka": "🧺", "washing machine": "🧺", "batoh": "🎒", "backpack": "🎒",
    "zošit": "📓", "notebook": "📓", "bazén": "🏊", "swimming pool": "🏊", "park": "🌳", "park": "🌳",
    "most": "🌉", "bridge": "🌉", "semafor": "🚦", "traffic light": "🚦", "mapa": "🗺️", "map": "🗺️",
    "počasie": "🌤️", "weather": "🌤️", "jar": "🌸", "spring": "🌸", "leto": "☀️", "summer": "☀️",
    "jeseň": "🍂", "autumn": "🍂", "zima": "❄️", "winter": "❄️", "polievka": "🍲", "soup": "🍲",
    "bloček": "🧾", "receipt": "🧾", "košík": "🧺", "basket": "🧺", "vozík": "🛒", "cart": "🛒",
    "kočík": "👶", "stroller": "👶", "narodeniny": "🎂", "birthday": "🎂", "diplom": "🎓", "diploma": "🎓",
}

ENGLISH_CORE = [
    # Relocation & Documents
    ("residence permit", "рэ́зидэнс пё́мит", "ВНЖ / вид на жительство", "We applied for a temporary residence permit.", "Мы подали заявление на временный ВНЖ.", "ВНЖ и документы", "A2", "🛂"),
    ("passport", "па́спорт", "загранпаспорт", "Please bring your valid passport to the appointment.", "Пожалуйста, возьмите действующий паспорт на запись.", "ВНЖ и документы", "A1", "📘"),
    ("application", "эпликэ́йшн", "заявление / заявка", "We submitted our application online.", "Мы подали заявление онлайн.", "ВНЖ и документы", "A2", "📄"),
    ("appointment", "эпо́йнтмэнт", "запись на приём", "I booked an appointment for Monday morning.", "Я забронировал запись на утро понедельника.", "ВНЖ и документы", "A2", "📅"),
    ("document", "до́кьюмэнт", "документ", "Keep all official documents in one folder.", "Храните все официальные документы в одной папке.", "ВНЖ и документы", "A1", "📑"),
    ("signature", "си́гнэча", "подпись", "Put your signature at the bottom of the page.", "Поставьте подпись внизу страницы.", "ВНЖ и документы", "A2", "✍️"),
    ("notary", "но́утэри", "нотариус", "The landlord signed the confirmation at the notary.", "Арендодатель подписал подтверждение у нотариуса.", "Нострификация и кадастр", "B1", "⚖️"),
    ("certified translation", "сё́тифайд трэнслэ́йшн", "заверенный (судебный) перевод", "You need a certified translation of your diploma.", "Вам нужен заверенный перевод диплома.", "Нострификация и кадастр", "B1", "📜"),
    ("insurance", "иншу́эрэнс", "страховка", "Health insurance is mandatory for residents.", "Медстраховка обязательна для резидентов.", "Медицина и здоровье", "A2", "🛡️"),
    ("deadline", "дэ́длайн", "крайний срок", "The submission deadline is next Friday.", "Крайний срок подачи — следующая пятница.", "ВНЖ и документы", "A2", "⏳"),

    # Housing & Rent
    ("apartment", "эпа́тмэнт", "квартира", "We found a bright apartment near the park.", "Мы нашли светлую квартиру рядом с парком.", "Жильё и аренда", "A1", "🏢"),
    ("rent", "рэнт", "аренда / арендная плата", "Monthly rent includes heating and water.", "Ежемесячная аренда включает отопление и воду.", "Жильё и аренда", "A1", "🏠"),
    ("lease agreement", "лис эгри́мэнт", "договор аренды", "Read the lease agreement carefully before signing.", "Внимательно прочитайте договор аренды перед подписанием.", "Жильё и аренда", "B1", "📝"),
    ("deposit", "дипо́зит", "залог (депозит)", "The refundable deposit equals one month of rent.", "Возвратный залог равен одной месячной аренде.", "Жильё и аренда", "A2", "💶"),
    ("landlord", "лэ́ндлод", "арендодатель (хозяин)", "Our landlord lives nearby and responds quickly.", "Наш арендодатель живёт рядом и быстро отвечает.", "Жильё и аренда", "A2", "🔑"),
    ("tenant", "тэ́нэнт", "арендатор (жилец)", "The tenant pays utilities every month.", "Арендатор оплачивает коммуналку каждый месяц.", "Жильё и аренда", "B1", "👤"),
    ("utilities", "юти́литиз", "коммунальные услуги", "Are utilities and Wi-Fi included in the price?", "Коммунальные услуги и Wi-Fi включены в цену?", "Жильё и аренда", "A2", "💡"),
    ("furnished", "фё́ништ", "меблированный", "The flat is fully furnished and ready to move in.", "Квартира полностью меблирована и готова к заселению.", "Жильё и аренда", "A2", "🛋️"),
    ("key", "ки", "ключ", "We received two sets of keys.", "Мы получили два комплекта ключей.", "Жильё и аренда", "A1", "🔑"),
    ("elevator", "э́ливэйта", "лифт", "The building has a modern elevator.", "В доме есть современный лифт.", "Жильё и аренда", "A1", "🛗"),
    ("balcony", "бэ́лкэни", "балкон", "We drink morning coffee on the balcony.", "Мы пьём утренний кофе на балконе.", "Жильё и аренда", "A1", "🌇"),
    ("kitchen", "ки́чин", "кухня", "The kitchen has a dishwasher and an oven.", "На кухне есть посудомоечная машина и духовка.", "Жильё и аренда", "A1", "🍳"),
    ("fridge", "фридж", "холодильник", "Put the fresh milk in the fridge.", "Поставь свежее молоко в холодильник.", "Жильё и аренда", "A1", "🧊"),
    ("washing machine", "во́шин мэши́н", "стиральная машина", "The washing machine is in the bathroom.", "Стиральная машина стоит в ванной.", "Жильё и аренда", "A1", "🧺"),
    ("neighbor", "нэ́йба", "сосед", "Our neighbors are very quiet and friendly.", "Наши соседи очень тихие и дружелюбные.", "Жильё и аренда", "A1", "🏘️"),
    ("heating", "хи́тин", "отопление", "Central heating keeps the flat warm in winter.", "Центральное отопление держит квартиру тёплой зимой.", "Жильё и аренда", "A2", "🔥"),
    ("repair", "рипэ́а", "ремонт / починить", "We need to repair the leaking tap.", "Нам нужно починить протекающий кран.", "Жильё и аренда", "A2", "🔧"),
    ("garbage", "га́бидж", "мусор", "We sort plastic, paper, and bio garbage.", "Мы сортируем пластик, бумагу и органический мусор.", "Жильё и аренда", "A1", "♻️"),

    # University & Study
    ("university", "юнивё́сити", "университет", "The university campus is easy to reach by tram.", "До кампуса университета легко добраться на трамвае.", "Университет и учёба", "A1", "🎓"),
    ("lecture", "лэ́кча", "лекция", "The economics lecture starts at ten.", "Лекция по экономике начинается в десять.", "Университет и учёба", "A2", "🎤"),
    ("seminar", "сэ́мина", "семинар", "Attendance at weekly seminars is required.", "Посещение еженедельных семинаров обязательно.", "Университет и учёба", "A2", "💬"),
    ("schedule", "скэ́дьюл", "расписание", "Check your class schedule in the student portal.", "Проверьте расписание занятий на студенческом портале.", "Университет и учёба", "A2", "🗓️"),
    ("exam", "игзэ́м", "экзамен", "The final exam takes place in January.", "Итоговый экзамен проходит в январе.", "Университет и учёба", "A1", "📝"),
    ("grade", "грэйд", "оценка", "She got the highest grade in statistics.", "Она получила высшую оценку по статистике.", "Университет и учёба", "A1", "⭐"),
    ("library", "ла́йбрэри", "библиотека", "I often study in the university library.", "Я часто занимаюсь в университетской библиотеке.", "Университет и учёба", "A1", "📚"),
    ("semester", "симэ́ста", "семестр", "The winter semester begins in September.", "Зимний семестр начинается в сентябре.", "Университет и учёба", "A2", "📅"),
    ("diploma", "дипло́ума", "диплом", "Recognition of a foreign diploma takes a few weeks.", "Признание иностранного диплома занимает несколько недель.", "Университет и учёба", "A2", "🎓"),
    ("presentation", "прэзэнтэ́йшн", "презентация", "We prepared a short presentation in English.", "Мы подготовили короткую презентацию на английском.", "Университет и учёба", "A2", "📊"),

    # Transport & City
    ("tram", "трэм", "трамвай", "Tram number four goes straight to the city center.", "Трамвай номер четыре идёт прямо в центр города.", "Город и транспорт", "A1", "🚋"),
    ("bus", "бас", "автобус", "The airport bus runs every ten minutes.", "Автобус в аэропорт ходит каждые десять минут.", "Город и транспорт", "A1", "🚌"),
    ("train", "трэйн", "поезд", "The train from Bratislava to Vienna takes one hour.", "Поезд из Братиславы в Вену идёт один час.", "Город и транспорт", "A1", "🚆"),
    ("ticket", "ти́кит", "билет", "Remember to validate your paper ticket on board.", "Не забудьте прокомпостировать бумажный билет.", "Город и транспорт", "A1", "🎫"),
    ("transfer", "трэ́нсфа", "пересадка", "This ticket is valid for sixty minutes with transfers.", "Этот билет действует 60 минут с пересадками.", "Город и транспорт", "A2", "🔄"),
    ("delay", "дилэ́й", "задержка / опоздание", "The train has a fifteen-minute delay.", "Поезд задерживается на пятнадцать минут.", "Город и транспорт", "A2", "⏱️"),
    ("airport", "э́апот", "аэропорт", "We arrived at the airport two hours early.", "Мы приехали в аэропорт за два часа.", "Город и транспорт", "A1", "✈️"),
    ("bridge", "бридж", "мост", "We walked across the bridge over the Danube.", "Мы перешли мост через Дунай.", "Город и транспорт", "A1", "🌉"),
    ("park", "пак", "парк", "Kids love playing in the city park.", "Дети обожают играть в городском парке.", "Город и транспорт", "A1", "🌳"),
    ("traffic light", "трэ́фик лайт", "светофор", "Turn left right after the traffic light.", "Поверните налево сразу после светофора.", "Город и транспорт", "A1", "🚦"),
    ("map", "мэп", "карта", "Let's check the transit map on my phone.", "Давай посмотрим карту транспорта на телефоне.", "Город и транспорт", "A1", "🗺️"),
    ("parking", "па́кин", "парковка", "Underground parking is free for two hours.", "Подземная парковка бесплатна два часа.", "Город и транспорт", "A1", "🅿️"),

    # Banks & Finance
    ("bank account", "бэнк эка́унт", "банковский счёт", "I would like to open a personal bank account.", "Я хотел бы открыть личный банковский счёт.", "Банки и финансы", "A2", "🏦"),
    ("bank statement", "бэнк стэ́йтмэнт", "выписка со счёта", "The police requested an official bank statement.", "Полиция запросила официальную выписку со счёта.", "Банки и финансы", "B1", "🧾"),
    ("balance", "бэ́лэнс", "остаток на счёте", "Check your account balance in the banking app.", "Проверьте остаток на счёте в банковском приложении.", "Банки и финансы", "A2", "💰"),
    ("credit card", "крэ́дит кад", "банковская карта", "Can I pay by credit card here?", "Можно ли здесь оплатить картой?", "Банки и финансы", "A1", "💳"),
    ("cash", "кэш", "наличные", "Small bakeries sometimes prefer cash.", "Небольшие пекарни иногда предпочитают наличные.", "Банки и финансы", "A1", "💶"),
    ("invoice", "и́нвойс", "счёт-фактура / инвойс", "Please pay the internet invoice by Friday.", "Пожалуйста, оплатите счёт за интернет до пятницы.", "Банки и финансы", "B1", "📄"),
    ("fee", "фи", "комиссия / сбор", "Student accounts have no monthly fee.", "У студенческих счетов нет ежемесячной комиссии.", "Банки и финансы", "A2", "🪙"),
    ("budget", "ба́джит", "бюджет", "We track our family budget every month.", "Мы ведём семейный бюджет каждый месяц.", "Банки и финансы", "A2", "📈"),

    # Medicine & Health
    ("doctor", "до́кта", "врач", "I need to register with a family doctor.", "Мне нужно прикрепиться к семейному врачу.", "Медицина и здоровье", "A1", "👨‍⚕️"),
    ("pharmacy", "фа́мэси", "аптека", "The pharmacy is open until eight o'clock.", "Аптека открыта до восьми часов.", "Медицина и здоровье", "A1", "💊"),
    ("prescription", "прискри́пшн", "рецепт (врача)", "The doctor sent an electronic prescription.", "Врач отправил электронный рецепт.", "Медицина и здоровье", "B1", "📋"),
    ("fever", "фи́ва", "высокая температура", "My son has a mild fever today.", "У моего сына сегодня небольшая температура.", "Медицина и здоровье", "A2", "🌡️"),
    ("headache", "хэ́дэйк", "головная боль", "Drink more water if you have a headache.", "Пей больше воды, если болит голова.", "Медицина и здоровье", "A1", "🤕"),
    ("cough", "коф", "кашель", "Do you have syrup for a dry cough?", "У вас есть сироп от сухого кашля?", "Медицина и здоровье", "A2", "🤧"),
    ("dentist", "дэ́нтист", "стоматолог", "I visit the dentist once a year for a checkup.", "Я хожу к стоматологу раз в год на осмотр.", "Медицина и здоровье", "A1", "🦷"),
    ("allergy", "э́лэджи", "аллергия", "I have no allergies to medication.", "У меня нет аллергии на лекарства.", "Медицина и здоровье", "A2", "🌿"),
    ("emergency", "имё́джэнси", "неотложка / экстренный случай", "Call 112 in case of an emergency.", "Звоните 112 в экстренном случае.", "Медицина и здоровье", "A2", "🚑"),

    # School & Kids
    ("school", "скул", "школа", "The primary school is ten minutes away on foot.", "Начальная школа в десяти минутах пешком.", "Школа и дети", "A1", "🏫"),
    ("kindergarten", "ки́ндэгатн", "детский сад", "Our younger child starts kindergarten in autumn.", "Наш младший ребёнок идёт в садик осенью.", "Школа и дети", "A1", "🧸"),
    ("teacher", "ти́ча", "учитель", "The class teacher sends updates every week.", "Классный руководитель присылает новости каждую неделю.", "Школа и дети", "A1", "👩‍🏫"),
    ("homework", "хо́умвёк", "домашнее задание", "Did you finish your homework before dinner?", "Ты закончил домашнее задание до ужина?", "Школа и дети", "A1", "✏️"),
    ("backpack", "бэ́кпэк", "рюкзак", "Pack your notebook and water bottle in the backpack.", "Положи тетрадь и бутылку воды в рюкзак.", "Школа и дети", "A1", "🎒"),
    ("playground", "плэ́йграунд", "детская площадка", "Kids play at the playground after school.", "Дети играют на площадке после школы.", "Школа и дети", "A1", "🛝"),
    ("swimming pool", "сви́мин пул", "бассейн", "We go to the swimming pool twice a week.", "Мы ходим в бассейн два раза в неделю.", "Школа и дети", "A1", "🏊"),
    ("bicycle", "ба́йсикл", "велосипед", "They ride their bicycles along the river.", "Они катаются на велосипедах вдоль реки.", "Школа и дети", "A1", "🚲"),
    ("birthday", "бё́сдэй", "день рождения", "We are celebrating her birthday this Saturday.", "Мы празднуем её день рождения в эту субботу.", "Школа и дети", "A1", "🎂"),

    # Supermarket & Food
    ("supermarket", "су́пэмакит", "супермаркет", "We buy groceries at the supermarket on Friday.", "Мы покупаем продукты в супермаркете в пятницу.", "Супермаркет и быт", "A1", "🛒"),
    ("receipt", "риси́т", "чек", "Always keep the receipt for electronics.", "Всегда сохраняйте чек на электронику.", "Супермаркет и быт", "A2", "🧾"),
    ("discount", "ди́скаунт", "скидка", "There is a twenty percent discount on cheese.", "На сыр действует скидка двадцать процентов.", "Супермаркет и быт", "A1", "🏷️"),
    ("bread", "брэд", "хлеб", "One loaf of fresh rye bread, please.", "Одну буханку свежего ржаного хлеба, пожалуйста.", "Супермаркет и быт", "A1", "🍞"),
    ("milk", "милк", "молоко", "We need whole milk and butter.", "Нам нужно цельное молоко и сливочное масло.", "Супермаркет и быт", "A1", "🥛"),
    ("cheese", "чиз", "сыр", "Slovak sheep cheese is delicious.", "Словацкий овечий сыр очень вкусный.", "Супермаркет и быт", "A1", "🧀"),
    ("vegetables", "вэ́джтэблз", "овощи", "I buy fresh vegetables at the local market.", "Я покупаю свежие овощи на местном рынке.", "Супермаркет и быт", "A1", "🥦"),
    ("fruit", "фрут", "фрукты", "We eat seasonal fruit for breakfast.", "Мы едим сезонные фрукты на завтрак.", "Супермаркет и быт", "A1", "🍎"),
    ("water", "во́та", "вода", "Still or sparkling water?", "Негазированную или газированную воду?", "Супермаркет и быт", "A1", "💧"),
    ("coffee", "ко́фи", "кофе", "Two cappuccinos to go, please.", "Два капучино с собой, пожалуйста.", "Кафе и еда", "A1", "☕"),
    ("lunch menu", "ланч мэ́нью", "бизнес-ланч", "The daily lunch menu includes soup.", "Дневной бизнес-ланч включает суп.", "Кафе и еда", "A1", "🍽️"),
    ("bill", "бил", "счёт (в ресторане)", "Could we have the bill, please?", "Можно нам счёт, пожалуйста?", "Кафе и еда", "A1", "🧾"),

    # Essential Verbs & Everyday Phrases
    ("understand", "андэстэ́нд", "понимать", "I understand you, please speak a bit slower.", "Я понимаю вас, говорите, пожалуйста, чуть медленнее.", "Глаголы", "A1", "🧠"),
    ("explain", "иксплэ́йн", "объяснить", "Could you explain how this form works?", "Не могли бы вы объяснить, как работает эта форма?", "Глаголы", "A2", "💡"),
    ("sign", "сайн", "подписать", "Both parties need to sign the contract.", "Обе стороны должны подписать договор.", "Глаголы", "A1", "✍️"),
    ("cancel", "кэ́нсл", "отменить", "I need to cancel my reservation.", "Мне нужно отменить бронирование.", "Глаголы", "A2", "❌"),
    ("confirm", "кэнфё́м", "подтвердить", "Please confirm our meeting by email.", "Пожалуйста, подтвердите нашу встречу по почте.", "Глаголы", "A2", "✅"),
    ("compare", "кэмпэ́а", "сравнить", "Let's compare two apartments before deciding.", "Давай сравним две квартиры перед решением.", "Глаголы", "A2", "⚖️"),
    ("move in", "мув ин", "заселиться / въехать", "We can move in on the first of September.", "Мы можем въехать первого сентября.", "Глаголы", "A2", "📦"),
    ("pick up", "пик ап", "забрать (детей / посылку)", "I will pick up the kids at four.", "Я заберу детей в четыре.", "Глаголы", "A2", "🚗"),
    ("of course", "ов кос", "конечно", "Of course, I will send it right away.", "Конечно, я отправлю это прямо сейчас.", "Разговорные фразы", "A1", "👍"),
    ("unfortunately", "анфо́чэнэтли", "к сожалению", "Unfortunately, all slots are taken today.", "К сожалению, все слоты на сегодня заняты.", "Разговорные фразы", "A2", "😕"),
    ("could you repeat", "куд ю рипи́т", "не могли бы вы повторить?", "Excuse me, could you repeat that slowly?", "Извините, не могли бы вы повторить это медленно?", "Разговорные фразы", "A1", "🔁"),
    ("how much is it", "хау мач из ит", "сколько это стоит?", "Excuse me, how much is a monthly pass?", "Извините, сколько стоит месячный проездной?", "Разговорные фразы", "A1", "💶"),
    ("no problem", "ноу про́блэм", "без проблем", "No problem, take your time.", "Без проблем, не торопитесь.", "Разговорные фразы", "A1", "👌"),
    ("weekend", "ви́кэнд", "выходные", "Have a wonderful weekend!", "Прекрасных выходных!", "Время и числа", "A1", "🌞"),
    ("weather", "вэ́за", "погода", "What is the weather forecast for tomorrow?", "Какой прогноз погоды на завтра?", "Время и числа", "A1", "🌤️"),
    ("holiday", "хо́лидэй", "праздник / отпуск", "Shops are closed on public holidays.", "Магазины закрыты в государственные праздники.", "Время и числа", "A1", "🎉"),
]


def pick_visual(word: str, cat: str) -> str:
    low = word.strip().lower()
    if low in WORD_VISUALS:
        return WORD_VISUALS[low]
    for k, icon in WORD_VISUALS.items():
        if k in low:
            return icon
    return CAT_ICONS.get(cat, "📌")


def build_sk():
    html = INDEX_HTML.read_text(encoding="utf-8")
    m = re.search(r"const VOCAB_SK = (\[.*?\]);", html)
    if not m:
        raise RuntimeError("VOCAB_SK не найден в index.html")
    raw = json.loads(m.group(1))
    clean = [dict(item) for item in raw[:145]]

    for item in clean:
        if item["word"] == "byť":
            item["pron"] = "быть (твёрдое y, мягкое ть)"
        item["visual"] = pick_visual(item["word"], item["cat"])
        item["concept_id"] = f"sk_{item['id']}"

    seen = {x["word"].strip().lower() for x in clean}
    next_id = len(clean) + 1

    for word, pron, trans, ex, ex_tr, cat, level in (EXTRA_BRATISLAVA_WORDS + EXPANSION_WORDS):
        k = word.strip().lower()
        if k in seen:
            continue
        seen.add(k)
        clean.append({
            "id": next_id,
            "word": word,
            "pron": pron,
            "trans": trans,
            "ex": ex,
            "ex_tr": ex_tr,
            "cat": cat,
            "level": level,
            "visual": pick_visual(word, cat),
            "concept_id": f"sk_{next_id}",
        })
        next_id += 1

    OUT_SK.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    return clean


def build_en():
    clean = []
    seen = set()
    for idx, (word, pron, trans, ex, ex_tr, cat, level, visual) in enumerate(ENGLISH_CORE, 1):
        k = word.strip().lower()
        if k in seen:
            continue
        seen.add(k)
        clean.append({
            "id": idx,
            "word": word,
            "pron": pron,
            "trans": trans,
            "ex": ex,
            "ex_tr": ex_tr,
            "cat": cat,
            "level": level,
            "visual": visual,
            "concept_id": f"en_{idx}",
        })
    OUT_EN.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    return clean


if __name__ == "__main__":
    sk = build_sk()
    en = build_en()
    print(f"[OK] vocab-sk.json: {len(sk)} чистых слов | vocab-en.json: {len(en)} чистых слов")
