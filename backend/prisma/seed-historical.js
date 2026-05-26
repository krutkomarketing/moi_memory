// Seed: исторические события XX века для общей летописи.
// Идемпотентно: повторный запуск не дублирует.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EVENTS = [
  { date: '1905-01-22', title: 'Первая русская революция',            iconKey: 'flag', description: 'Волнения по всей стране, потрясшие основы Российской империи.' },
  { date: '1914-07-28', title: 'Начало Первой мировой войны',         iconKey: 'war',  description: 'Война охватила Европу, затронув в том числе белорусские земли.' },
  { date: '1917-11-07', title: 'Октябрьская революция',               iconKey: 'flag', description: 'Большевики во главе с Лениным взяли власть в Петрограде.' },
  { date: '1919-01-01', title: 'Образование БССР',                    iconKey: 'flag', description: 'Провозглашение Белорусской Советской Социалистической Республики.' },
  { date: '1921-10-30', title: 'Открытие БГУ',                        iconKey: 'book', description: 'Основан Белорусский государственный университет — старейший в республике.' },
  { date: '1922-12-30', title: 'Образование СССР',                    iconKey: 'flag', description: 'Создание Союза Советских Социалистических Республик. БССР вошла в состав.' },
  { date: '1939-09-01', title: 'Начало Второй мировой войны',         iconKey: 'war',  description: 'Нападение Германии на Польшу. Война охватила весь мир.' },
  { date: '1941-06-22', title: 'Начало Великой Отечественной войны',  iconKey: 'war',  description: 'Нападение нацистской Германии на СССР. Беларусь — в зоне оккупации.' },
  { date: '1944-07-03', title: 'Освобождение Минска',                 iconKey: 'star', description: 'Победоносная операция «Багратион», изгнание оккупантов из Беларуси.' },
  { date: '1945-05-09', title: 'День Победы',                         iconKey: 'star', description: 'Безоговорочная капитуляция нацистской Германии. БССР — среди основателей ООН.' },
  { date: '1946-05-29', title: 'Строительство МТЗ',                   iconKey: 'book', description: 'Начало возведения Минского тракторного завода.' },
  { date: '1947-08-15', title: 'Первые грузовики МАЗ',                iconKey: 'book', description: 'Выпуск первых белорусских тяжёлых автомобилей МАЗ-205.' },
  { date: '1957-10-04', title: 'Запуск первого спутника',             iconKey: 'star', description: 'СССР вывел на орбиту первый искусственный спутник Земли.' },
  { date: '1958-09-01', title: 'Первый БелАЗ',                        iconKey: 'book', description: 'Выпуск первого карьерного самосвала на заводе в Жодино.' },
  { date: '1961-04-12', title: 'Полёт Юрия Гагарина',                 iconKey: 'star', description: 'Первый в истории полёт человека в космос. 108 минут вокруг Земли.' },
  { date: '1971-09-25', title: 'Мемориал «Брестская крепость»',       iconKey: 'star', description: 'Торжественное открытие мемориального комплекса.' },
  { date: '1984-06-30', title: 'Открытие Минского метро',             iconKey: 'book', description: 'Запуск первой линии метрополитена в Минске.' },
  { date: '1986-04-26', title: 'Авария на Чернобыльской АЭС',         iconKey: 'war',  description: 'Крупнейшая ядерная катастрофа. Значительная часть Беларуси — в зоне загрязнения.' },
  { date: '1990-07-27', title: 'Декларация о суверенитете БССР',      iconKey: 'flag', description: 'Принятие Декларации о государственном суверенитете БССР.' },
  { date: '1991-12-08', title: 'Распад СССР',                         iconKey: 'flag', description: 'Беловежские соглашения. Образование СНГ. Беларусь — независимая страна.' },
  { date: '1994-07-10', title: 'Первые президентские выборы Беларуси', iconKey: 'flag', description: 'Состоялись первые в истории независимой Беларуси выборы президента.' },
  { date: '2005-09-22', title: 'Основание ПВТ',                       iconKey: 'book', description: 'Создание Парка высоких технологий — старта белорусского IT-сектора.' },
  { date: '2006-06-16', title: 'Новое здание Нацбиблиотеки',          iconKey: 'book', description: 'Открытие уникального здания Национальной библиотеки — «алмаза знаний».' },
];

async function main() {
  let created = 0, skipped = 0;
  for (const ev of EVENTS) {
    const date = new Date(ev.date);
    const exists = await prisma.timelineEvent.findFirst({
      where: { title: ev.title, date, category: 'HISTORICAL' },
    });
    if (exists) { skipped++; continue; }
    await prisma.timelineEvent.create({
      data: {
        category: 'HISTORICAL',
        title: ev.title,
        description: ev.description,
        date,
        dateAccuracy: 'day',
        iconKey: ev.iconKey,
      },
    });
    created++;
    console.log(`  ✓ ${ev.date} — ${ev.title}`);
  }
  console.log(`\nДобавлено: ${created}, пропущено (уже есть): ${skipped}, всего: ${EVENTS.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
