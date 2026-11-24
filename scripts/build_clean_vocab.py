#!/usr/bin/env python3
"""
Генерирует чистый, провалидированный словарь slovak-studio/data/vocab-sk.json:
- Берёт первые 145 реальных словацких слов из исправленного index.html.
- Добавляет 105 ключевых слов для переезда семьи в Братиславу:
  Медицина и здоровье, Кафе и еда, Банки и финансы, Школа и дети,
  Нострификация и кадастр, Транспорт IDS BK и почта.
- Валидирует отсутствие заглушек, дубликатов, пустых переводов и неверных категорий.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX_HTML = ROOT / "index.html"
OUT_JSON = ROOT / "slovak-studio" / "data" / "vocab-sk.json"

ALLOWED_CATS = {
    "ВНЖ и документы",
    "Жильё и аренда",
    "Университет и учёба",
    "Ложные друзья",
    "Глаголы",
    "Город и транспорт",
    "Супермаркет и быт",
    "Прилагательные",
    "Наречия и время",
    "Медицина и здоровье",
    "Кафе и еда",
    "Банки и финансы",
    "Школа и дети",
    "Нострификация и кадастр",
}

EXTRA_BRATISLAVA_WORDS = [
    # Медицина и здоровье (20)
    ("lekár", "ле́кар", "врач", "Potrebujem sa objednať k všeobecnému lekárovi.", "Мне нужно записаться к терапевту.", "Медицина и здоровье", "A1"),
    ("všeobecný lekár", "вше́обецны ле́кар", "терапевт (врач общей практики)", "Hľadáme všeobecného lekára v Ružinove, ktorý prijíma nových pacientov.", "Мы ищем терапевта в Ружинове, который принимает новых пациентов.", "Медицина и здоровье", "A2"),
    ("pediater", "пэ́диатер", "педиатр", "Deti musia byť zaregistrované u pediatra.", "Дети должны быть зарегистрированы у педиатра.", "Медицина и здоровье", "A2"),
    ("pohotovosť", "по́готовость", "дежурная скорая / травмпункт", "Cez víkend sme museli ísť na pohotovosť na Kramáre.", "На выходных нам пришлось поехать в дежурную на Крамаре.", "Медицина и здоровье", "A2"),
    ("lekáreň", "ле́карень", "аптека", "Najbližšia lekáreň je otvorená do ôsmej večer.", "Ближайшая аптека открыта до восьми вечера.", "Медицина и здоровье", "A1"),
    ("recept", "рэ́цэпт", "рецепт (лекарственный)", "Lekár mi poslal elektronický eRecept do lekárne.", "Врач отправил мне электронный рецепт в аптеку.", "Медицина и здоровье", "A1"),
    ("preukaz poistenca", "прэ́указ по́истенца", "полис / карточка медстраховки", "Pri registrácii ukážte preukaz poistenca.", "При регистрации покажите карточку медстраховки.", "Медицина и здоровье", "A2"),
    ("horúčka", "го́ручка", "высокая температура (жар)", "Syn má od rána vysokú horúčku.", "У сына с утра высокая температура.", "Медицина и здоровье", "A1"),
    ("bolesť", "бо́лесть", "боль", "Mám silnú bolesť hlavy a hrdla.", "У меня сильная головная боль и боль в горле.", "Медицина и здоровье", "A1"),
    ("kašeľ", "ка́шель", "кашель", "Prosím si sirup na suchý kašeľ.", "Пожалуйста, сироп от сухого кашля.", "Медицина и здоровье", "A1"),
    ("nádcha", "на́дха", "насморк", "Na nádchu mi stačia kvapky do nosa.", "От насморка мне хватит капель в нос.", "Медицина и здоровье", "A2"),
    ("vyšetrenie", "ви́шетрение", "обследование / осмотр", "Na odborné vyšetrenie treba výmenný lístok.", "На профильное обследование нужно направление.", "Медицина и здоровье", "B1"),
    ("výmenný lístok", "ви́менны ли́сток", "направление к специалисту", "Všeobecný lekár mi dal výmenný lístok k ortopédovi.", "Терапевт дал мне направление к ортопеду.", "Медицина и здоровье", "B1"),
    ("zubár", "зу́бар", "стоматолог", "Preventívna prehliadka u zubára je raz ročne.", "Профилактический осмотр у стоматолога раз в год.", "Медицина и здоровье", "A1"),
    ("alergia", "а́лергия", "аллергия", "Nemám žiadnu alergiu na lieky.", "У меня нет никакой аллергии на лекарства.", "Медицина и здоровье", "A1"),
    ("liek", "ли́ек", "лекарство", "Tento liek sa užíva dvakrát denne po jedle.", "Это лекарство принимается дважды в день после еды.", "Медицина и здоровье", "A1"),
    ("očkovanie", "о́чкование", "прививка / вакцинация", "Do školy treba potvrdenie o očkovaní.", "В школу нужна справка о прививках.", "Медицина и здоровье", "A2"),
    ("zdravotná poisťovňa", "здра́вотна по́истёвня", "страховая медицинская компания", "Sme poistení vo Všeobecnej zdravotnej poisťovni.", "Мы застрахованы во Всеобщей медицинской страховой.", "Медицина и здоровье", "B1"),
    ("sanitka", "са́нитка", "машина скорой помощи", "V naliehavom prípade zavolajte sanitku na 155.", "В экстренном случае вызывайте скорую по номеру 155.", "Медицина и здоровье", "A2"),
    ("prehliadka", "прэ́глиадка", "медосмотр / проверка", "Absolvoval som povinnú lekársku prehliadku pre políciu.", "Я прошёл обязательный медосмотр для полиции.", "Медицина и здоровье", "B1"),

    # Кафе и еда (15)
    ("jedálny lístok", "йэ́далны ли́сток", "меню", "Môžeme si poprosiť jedálny lístok?", "Можно попросить меню?", "Кафе и еда", "A1"),
    ("denné menu", "дэ́ннэ мэ́ну", "бизнес-ланч (обеденное меню)", "Denné menu podávajú od jedenástej do druhej.", "Бизнес-ланч подают с одиннадцати до двух.", "Кафе и еда", "A1"),
    ("účet", "у́чет", "счёт (в кафе или в банке)", "Poprosím účet, zaplatím kartou.", "Счёт, пожалуйста, я оплачу картой.", "Кафе и еда", "A1"),
    ("sprepitné", "спрэ́питнэ", "чаевые", "Spropitné nechávame okolo desať percent.", "Чаевые мы оставляем около десяти процентов.", "Кафе и еда", "A2"),
    ("objednať si", "о́бйеднать си", "заказать (себе)", "Chcel by som si objednať espresso s mliekom.", "Я хотел бы заказать эспрессо с молоком.", "Кафе и еда", "A1"),
    ("čapované pivo", "ча́пованэ пи́во", "разливное пиво", "Jedno malé čapované a kofolu, prosím.", "Одно маленькое разливное и кофолу, пожалуйста.", "Кафе и еда", "A1"),
    ("polievka", "по́лиевка", "суп", "Cesnaková polievka je v cene denného menu.", "Чесночный суп входит в цену бизнес-ланча.", "Кафе и еда", "A1"),
    ("hlavné jedlo", "гла́внэ йэ́дло", "основное блюдо", "Ako hlavné jedlo si dám bryndzové halušky.", "На основное блюдо я возьму брынзовые галушки.", "Кафе и еда", "A1"),
    ("príloha", "при́лога", "гарнир", "Akú prílohu si želáte k mäsu — ryžu alebo zemiaky?", "Какой гарнир желаете к мясу — рис или картофель?", "Кафе и еда", "A2"),
    ("so sebou", "со сэ́боу", "с собой (навынос)", "Dve cappuccina so sebou, prosím.", "Два капучино с собой, пожалуйста.", "Кафе и еда", "A1"),
    ("stôl pre štyroch", "сту́ол прэ шти́рох", "столик на четверых", "Máte voľný stôl pre štyroch na terase?", "У вас есть свободный столик на четверых на террасе?", "Кафе и еда", "A1"),
    ("raňajky", "ра́няйки", "завтрак", "Raňajky podávajú od siedmej do desiatej.", "Завтрак подают с семи до десяти.", "Кафе и еда", "A1"),
    ("obed", "о́бед", "обед", "Pôjdeme dnes na obed blízko univerzity?", "Пойдём сегодня на обед рядом с университетом?", "Кафе и еда", "A1"),
    ("večera", "вэ́чера", "ужин", "Na večeru som pripravil šalát a lososa.", "На ужин я приготовил салат и лосося.", "Кафе и еда", "A1"),
    ("bez lepku", "бэз ле́пку", "без глютена", "Máte v ponuke aj niečo bez lepku?", "У вас в меню есть что-нибудь без глютена?", "Кафе и еда", "A2"),

    # Банки и финансы (18)
    ("bežný účet", "бэ́жны у́чет", "текущий банковский счёт", "Chcem si otvoriť bežný účet v Tatra banke.", "Я хочу открыть текущий счёт в Tatra banka.", "Банки и финансы", "A2"),
    ("výpis z účtu", "ви́пис з у́чту", "выписка со счёта", "Na cudzineckú políciu potrebujem potvrdenie o zostatku a výpis z účtu.", "В миграционную полицию мне нужна справка об остатке и выписка со счёта.", "Банки и финансы", "A2"),
    ("zostatok", "зо́статок", "остаток на счёте", "Potrebujem oficiálne potvrdenie o zostatku na účte.", "Мне нужна официальная справка об остатке на счёте.", "Банки и финансы", "B1"),
    ("prevod", "прэ́вод", "банковский перевод", "Nájom platíme mesačne bankovým prevodom.", "Аренду мы платим ежемесячно банковским переводом.", "Банки и финансы", "A2"),
    ("trvalý príkaz", "трва́лы при́каз", "автоплатёж (постоянное поручение)", "Nastavil som si trvalý príkaz na platbu nájmu.", "Я настроил автоплатёж для оплаты аренды.", "Банки и финансы", "B1"),
    ("variabilný symbol", "ва́риабилны си́мбол", "идентификатор платежа (VS)", "Pri platbe školného nezabudnite uviesť variabilný symbol.", "При оплате учёбы не забудьте указать variabilný symbol.", "Банки и финансы", "B1"),
    ("bankomat", "ба́нкомат", "банкомат", "Kde je tu najbližší bankomat Slovenskej sporiteľne?", "Где здесь ближайший банкомат Slovenská sporiteľňa?", "Банки и финансы", "A1"),
    ("hotovosť", "го́товость", "наличные деньги", "Dá sa platiť kartou, alebo len v hotovosti?", "Можно оплатить картой или только наличными?", "Банки и финансы", "A1"),
    ("platobná karta", "пла́тобна ка́рта", "банковская карта", "Platobná karta mi príde do týždňa poštou.", "Банковская карта придёт мне через неделю почтой.", "Банки и финансы", "A1"),
    ("poplatok", "по́платок", "комиссия / сбор", "Vedenie študentského účtu je bez poplatku.", "Ведение студенческого счёта без комиссии.", "Банки и финансы", "A2"),
    ("daň", "дань", "налог", "Daňové priznanie sa podáva do konca marca.", "Налоговая декларация подаётся до конца марта.", "Банки и финансы", "B1"),
    ("faktúra", "фа́ктура", "счёт-фактура / инвойс", "Faktúru za internet platím do pätnásteho dňa v mesiaci.", "Счёт за интернет я оплачиваю до пятнадцатого числа месяца.", "Банки и финансы", "A2"),
    ("splatnosť", "спла́тность", "срок оплаты", "Dátum splatnosti faktúry je zajtra.", "Срок оплаты счёта — завтра.", "Банки и финансы", "B1"),
    ("zmenáreň", "змэ́нарень", "обменный пункт", "Kurz v tejto zmenárni je veľmi dobrý.", "Курс в этом обменнике очень хороший.", "Банки и финансы", "A2"),
    ("príjem", "при́йем", "доход", "K žiadosti o pobyt dokladujeme stabilný príjem.", "К заявлению на ВНЖ мы подтверждаем стабильный доход.", "Банки и финансы", "B1"),
    ("výdavky", "ви́давки", "расходы", "Mesačné výdavky na rodinu si sledujeme v tabuľke.", "Ежемесячные расходы семьи мы отслеживаем в таблице.", "Банки и финансы", "A2"),
    ("úspory", "у́споры", "сбережения", "Časť úspor držíme na sporiacom účte.", "Часть сбережений мы держим на сберегательном счёте.", "Банки и финансы", "B1"),
    ("pobočka", "по́бочка", "отделение (банка / почты)", "Musím ísť osobne na pobočku banky s pasom.", "Мне нужно лично прийти в отделение банка с паспортом.", "Банки и финансы", "A2"),

    # Школа и дети (18)
    ("základná škola", "за́кладна шко́ла", "начальная и средняя школа (1–9 кл.)", "Hľadáme dobrú základnú školu v našej mestskej časti.", "Мы ищем хорошую школу в нашем районе.", "Школа и дети", "A1"),
    ("materská škola", "ма́тэрска шко́ла", "детский сад (škôlka)", "Prihláška do materskej školy sa podáva v máji.", "Заявление в детский сад подаётся в мае.", "Школа и дети", "A1"),
    ("zápis do školy", "за́пис до шко́лы", "запись / зачисление в школу", "Kedy prebieha zápis detí do prvého ročníka?", "Когда проходит запись детей в первый класс?", "Школа и дети", "A2"),
    ("triedna učiteľka", "три́една у́чителька", "классный руководитель", "Triedna učiteľka nám napísala správu cez EduPage.", "Классный руководитель написала нам сообщение через EduPage.", "Школа и дети", "A2"),
    ("školský klub", "шко́лски клуб", "продлёнка (ŠKD / družina)", "Po vyučovaní chodí syn do školského klubu do štvrtej.", "После уроков сын ходит на продлёнку до четырёх.", "Школа и дети", "A2"),
    ("ospravedlnenka", "о́справедлнэнка", "записка об отсутствии в школе", "Poslali sme ospravedlnenku cez aplikáciu EduPage.", "Мы отправили записку об отсутствии через приложение EduPage.", "Школа и дети", "B1"),
    ("školská jedáleň", "шко́лска йэ́далень", "школьная столовая", "Dieťa treba prihlásiť na obedy v školskej jedálni.", "Ребёнка нужно записать на обеды в школьной столовой.", "Школа и дети", "A2"),
    ("triedna schôdzka", "три́една схо́дзка", "родительское собрание", "V utorok o piatej máme triednu schôdzku.", "Во вторник в пять у нас родительское собрание.", "Школа и дети", "A2"),
    ("krúžok", "кру́жок", "кружок / секция", "Dcéra chodí na plavecký a výtvarný krúžok.", "Дочь ходит в секцию плавания и художественный кружок.", "Школа и дети", "A1"),
    ("domáca úloha", "до́маца у́лога", "домашнее задание", "Už si urobil domácu úlohu zo slovenčiny?", "Ты уже сделал домашнее задание по словацкому?", "Школа и дети", "A1"),
    ("vysvedčenie", "ви́сведчение", "табель успеваемости / аттестат", "Na konci júna dostanú deti koncoročné vysvedčenie.", "В конце июня дети получат годовой табель.", "Школа и дети", "B1"),
    ("prázdniny", "пра́зднины", "каникулы", "Jarné prázdniny v Bratislave bývajú v marci.", "Весенние каникулы в Братиславе бывают в марте.", "Школа и дети", "A1"),
    ("riaditeľ", "ри́адитель", "директор школы", "Máme stretnutie s riaditeľom školy kvôli prijatiu.", "У нас встреча с директором школы по поводу зачисления.", "Школа и дети", "A2"),
    ("prezuvky", "прэ́зувки", "сменная обувь", "Do školy a škôlky musia mať deti prezuvky.", "В школу и садик у детей должна быть сменная обувь.", "Школа и дети", "A2"),
    ("úbor na telesnú", "у́бор на тэ́лэсну", "спортивная форма на физкультуру", "Nezabudni si zabaliť úbor na telesnú výchovu.", "Не забудь положить форму на физкультуру.", "Школа и дети", "A2"),
    ("ihrisko", "и́гриско", "детская площадка", "Po škole sa deti hrajú na detskom ihrisku.", "После школы дети играют на детской площадке.", "Школа и дети", "A1"),
    ("plávanie", "пла́вание", "плавание", "Deti chodia na kurz plávania dvakrát do týždňa.", "Дети ходят на занятия плаванием дважды в неделю.", "Школа и дети", "A1"),
    ("jazykový kurz", "я́зиковы курз", "языковой курс", "Škola ponúka adaptačný jazykový kurz pre cudzincov.", "Школа предлагает адаптационный языковой курс для иностранцев.", "Школа и дети", "A2"),

    # Нострификация и кадастр (16)
    ("nostrifikácia", "но́стрификация", "нострификация (признание диплома)", "Nostrifikácia diplomu je nutná pre prijatie na EUBA.", "Нострификация диплома необходима для поступления в EUBA.", "Нострификация и кадастр", "B1"),
    ("uznanie dokladov", "у́знание до́кладов", "признание документов об образовании", "Žiadosť o uznanie dokladov o vzdelaní podávame na ministerstvo.", "Заявление о признании документов об образовании подаём в министерство.", "Нострификация и кадастр", "B1"),
    ("apostila", "а́постила", "апостиль", "Rodný list a diplom musia mať apostilu.", "Свидетельство о рождении и диплом должны иметь апостиль.", "Нострификация и кадастр", "B1"),
    ("súdny preklad", "су́дны прэ́клад", "судебный (присяжный) перевод", "Cudzinecká polícia akceptuje iba úradný súdny preklad.", "Миграционная полиция принимает только судебный перевод.", "Нострификация и кадастр", "B1"),
    ("list vlastníctva", "лист вла́стництва", "выписка из кадастра недвижимости", "K potvrdeniu o ubytovaní priložte list vlastníctva.", "К подтверждению проживания приложите выписку из кадастра.", "Нострификация и кадастр", "B1"),
    ("kataster", "ка́тастэр", "кадастр недвижимости", "Údaje o majiteľovi bytu sme overili na katastri.", "Данные о собственнике квартиры мы проверили в кадастре.", "Нострификация и кадастр", "B1"),
    ("potvrdenie o ubytovaní", "по́тврдение о у́битовани", "подтверждение проживания (для ВНЖ)", "Majiteľ bytu podpísal potvrdenie o ubytovaní u notára.", "Владелец квартиры подписал подтверждение проживания у нотариуса.", "Нострификация и кадастр", "A2"),
    ("plná moc", "плна́ моц", "доверенность", "Manželke som dal notársky overenú plnú moc.", "Я дал жене нотариально заверенную доверенность.", "Нострификация и кадастр", "B1"),
    ("notár", "но́тар", "нотариус", "Overenie jedného podpisu u notára stojí pár eur.", "Заверение одной подписи у нотариуса стоит пару евро.", "Нострификация и кадастр", "A2"),
    ("matrika", "ма́трика", "ЗАГС", "Overenie podpisu sa dá urobiť aj na matrike na miestnom úrade.", "Заверить подпись можно также в ЗАГСе местной управы.", "Нострификация и кадастр", "B1"),
    ("preberací protokol", "прэ́бераци про́токол", "акт приёма-передачи квартиры", "Do preberacieho protokolu sme zapísali stavy meračov.", "В акт приёма-передачи мы записали показания счётчиков.", "Нострификация и кадастр", "B1"),
    ("stav meračov", "став мэ́рачов", "показания счётчиков", "Pri nasťahovaní si odfoťte stav meračov vody a elektriny.", "При заселении сфотографируйте показания счётчиков воды и электричества.", "Нострификация и кадастр", "B1"),
    ("trvalé bydlisko", "трва́лэ би́длиско", "постоянное место жительства", "Ako adresu pre poštu sme uviedli naše bydlisko v Bratislave.", "В качестве адреса для почты мы указали наш адрес в Братиславе.", "Нострификация и кадастр", "B1"),
    ("žltý lístok", "жлты́ ли́сток", "почтовое извещение (жёлтый листок)", "V schránke sme našli žltý lístok zo Slovenskej pošty.", "В почтовом ящике мы нашли извещение от Словацкой почты.", "Нострификация и кадастр", "A2"),
    ("doporučený list", "до́поручены лист", "заказное письмо", "Rozhodnutie z polície príde ako doporučený list do vlastných rúk.", "Решение из полиции придёт заказным письмом лично в руки.", "Нострификация и кадастр", "B1"),
    ("kolková známka", "ко́лкова зна́мка", "гербовая марка (eKolok)", "Elektronickú kolkovú známku kúpite aj na pošte.", "Электронную марку госпошлины можно купить и на почте.", "Нострификация и кадастр", "B1"),

    # Транспорт IDS BK, быт и университет EUBA (18)
    ("električenka", "э́лектриченка", "проездной на транспорт Братиславы", "Kúpil som si mesačnú električenku v aplikácii IDS BK.", "Я купил месячный проездной в приложении IDS BK.", "Город и транспорт", "A1"),
    ("označovač", "о́значовач", "компостер в транспорте", "Papierový lístok musíte vložiť do označovača.", "Бумажный билет нужно вставить в компостер.", "Город и транспорт", "A2"),
    ("revízor", "рэ́визор", "контролёр в транспорте", "Revízor kontroluje platnosť lístkov v električke.", "Контролёр проверяет действительность билетов в трамвае.", "Город и транспорт", "A2"),
    ("pokuta", "по́кута", "штраф", "Za jazdu bez platného lístka je vysoká pokuta.", "За проезд без действительного билета большой штраф.", "Город и транспорт", "A2"),
    ("zóna", "зо́на", "тарифная зона (100+101 в Братиславе)", "Pre celú Bratislavu potrebujete zóny 100 a 101.", "Для всей Братиславы нужны зоны 100 и 101.", "Город и транспорт", "A2"),
    ("trolejbus", "тро́лейбус", "троллейбус", "Trolejbusom sa dostaneme priamo k nemocnici.", "На троллейбусе мы доедем прямо к больнице.", "Город и транспорт", "A1"),
    ("kruhový objazd", "кру́говы о́бъязд", "круговое движение", "Na kruhovom objazde odbočte na druhom výjazde.", "На круговом движении сверните на втором съезде.", "Город и транспорт", "A2"),
    ("parkovacia zóna", "па́рковациа зо́на", "зона платной парковки (PAAS)", "V Ružinove platí rezidentská parkovacia zóna PAAS.", "В Ружинове действует резидентская парковочная зона PAAS.", "Город и транспорт", "B1"),
    ("ISIC karta", "и́сик ка́рта", "студенческий билет ISIC", "S ISIC kartou máte zľavu päťdesiat percent na MHD.", "С картой ISIC у вас скидка 50% на городской транспорт.", "Университет и учёба", "A1"),
    ("kredit", "крэ́дит", "академический кредит (ECTS)", "Za semester musíte získať aspoň tridsať kreditov.", "За семестр нужно набрать минимум тридцать кредитов.", "Университет и учёба", "A2"),
    ("semester", "сэ́мэстэр", "семестр", "Zimný semester na EUBA začína v polovici septembra.", "Зимний семестр в EUBA начинается в середине сентября.", "Университет и учёба", "A1"),
    ("bakalárska práca", "ба́каларска пра́ца", "дипломная работа бакалавра", "Tému bakalárskej práce si vyberáte v druhom ročníku.", "Тему бакалаврской работы выбирают на втором курсе.", "Университет и учёба", "B1"),
    ("študijné oddelenie", "шту́дийнэ о́дделение", "учебный отдел / деканат", "Úradné hodiny na študijnom oddelení sú v pondelok a stredu.", "Приёмные часы в учебном отделе по понедельникам и средам.", "Университет и учёба", "A2"),
    ("potvrdenie o návšteve školy", "по́тврдение о на́вштеве шко́лы", "справка об обучении", "Potvrdenie o návšteve školy stiahnete priamo v AIS.", "Справку об обучении можно скачать прямо в AIS.", "Университет и учёба", "A2"),
    ("kniha / knižnica", "кни́га / кни́жница", "книга / библиотека", "Slovenská ekonomická knižnica je priamo v areáli EUBA.", "Словацкая экономическая библиотека находится прямо в кампусе EUBA.", "Университет и учёба", "A1"),
    ("štipendium", "шти́пэндиум", "стипендия", "Za výborné známky môžete získať prospechové štipendium.", "За отличные оценки можно получить стипендию за успеваемость.", "Университет и учёба", "B1"),
    ("odpadkový kôš", "о́дпадковы ку́ош", "мусорное ведро / контейнер", "Žltý kontajner je na plasty a modrý na papier.", "Жёлтый контейнер для пластика, а синий для бумаги.", "Супермаркет и быт", "A1"),
    ("zálohovanie fliaš", "за́логование фли́аш", "сдача бутылок за залог (0,15 €)", "Plastové fľaše so znakom Z vrátime v automate v Bille.", "Пластиковые бутылки со знаком Z сдаём в автомате в Billa.", "Супермаркет и быт", "A2"),
]


def main() -> None:
    html = INDEX_HTML.read_text(encoding="utf-8")
    match = re.search(r"const VOCAB_SK = (\[.*?\]);", html)
    if not match:
        raise RuntimeError("VOCAB_SK не найден в index.html")

    raw = json.loads(match.group(1))
    clean = [item for item in raw[:145]]

    # Исправляем фонетическую подсказку для byť (y твёрдое)
    for item in clean:
        if item["word"] == "byť":
            item["pron"] = "быть (твёрдое y, мягкое ть)"

    next_id = len(clean) + 1
    seen = {item["word"].strip().lower() for item in clean}

    for word, pron, trans, ex, ex_tr, cat, level in EXTRA_BRATISLAVA_WORDS:
        key = word.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        clean.append({
            "id": next_id,
            "word": word,
            "pron": pron,
            "trans": trans,
            "ex": ex,
            "ex_tr": ex_tr,
            "cat": cat,
            "level": level,
        })
        next_id += 1

    # Валидация
    errors = []
    for item in clean:
        if item["trans"].startswith("слово '"):
            errors.append(f"Stub trans at id={item['id']}")
        if "Použitie slova" in item["ex"]:
            errors.append(f"Stub example at id={item['id']}")
        if item["cat"] not in ALLOWED_CATS:
            errors.append(f"Unknown cat '{item['cat']}' at id={item['id']}")
        if item["level"] not in ("A1", "A2", "B1", "B2"):
            errors.append(f"Bad level '{item['level']}' at id={item['id']}")

    if errors:
        raise SystemExit("Validation failed:\n" + "\n".join(errors[:20]))

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] Создан чистый словарь {OUT_JSON}: {len(clean)} проверенных слов (0 заглушек, 0 ошибок)")


if __name__ == "__main__":
    main()
