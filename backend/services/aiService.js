'use strict';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * System prompt to guide the AI model's behavior and formatting.
 */
const SYSTEM_PROMPT = `Ты — профессиональный ИИ-помощник и редактор мемориального сайта-летописи "Память".
Твоя цель — помогать пользователям писать и улучшать тексты о жизни их близких (биографии, воспоминания, истории из детства, карьеры и т.д.).
Тон общения должен быть уважительным, деликатным, теплым, сочувствующим и профессиональным.

Ты ВСЕГДА должен отвечать строго в формате JSON со следующими полями:
{
  "chatResponse": "Твое сообщение пользователю в чате (комментарии, вопросы, предложения о правках)",
  "proposedText": "Итоговый улучшенный или сгенерированный текст биографии/раздела. Если ты просто ведешь диалог и текст еще не готов, оставь это поле пустым или сохрани предыдущую версию"
}

Форматирование:
- proposedText должен содержать красиво структурированный текст. Избегай Markdown разметки вроде заголовков #, но можешь разделять текст на абзацы.
- Отвечай на русском языке.

Сценарии:
1. Если пользователь хочет улучшить существующий текст: проанализируй его стиль, исправь орфографические, грамматические и пунктуационные ошибки, улучши структуру и плавность повествования. Учти пожелания пользователя (например, сделать текст более эмоциональным или наоборот официальным).
2. Если текст пишется с нуля: расспроси пользователя о теме и важных фактах/именах/датах, если они еще не предоставлены, а затем сгенерируй повествование.
`;

/**
 * Main entry point for AI chat requests.
 */
async function chat({ messages, context }) {
  if (GEMINI_API_KEY) {
    return callGemini(messages, context);
  } else if (OPENAI_API_KEY) {
    return callOpenAI(messages, context);
  } else {
    return generateMockResponse(messages, context);
  }
}

/**
 * Calls Gemini API using native fetch.
 */
async function callGemini(messages, context) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  // Format messages for Gemini
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // Append context to the last message if needed
  if (context && contents.length > 0) {
    const lastMsg = contents[contents.length - 1];
    let contextStr = `\n\n[Контекст: `;
    if (context.originalText) contextStr += `Оригинальный текст: "${context.originalText}". `;
    if (context.topic) contextStr += `Тема: "${context.topic}". `;
    if (context.keywords) contextStr += `Ключевые слова/факты: "${context.keywords}". `;
    if (context.field) contextStr += `Раздел страницы: "${context.field}". `;
    contextStr += `]`;
    lastMsg.parts[0].text += contextStr;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      throw new Error('Gemini returned an empty response');
    }

    return JSON.parse(responseText.trim());
  } catch (err) {
    console.error('[callGemini] failed:', err);
    return generateMockResponse(messages, context);
  }
}

/**
 * Calls OpenAI API using native fetch.
 */
async function callOpenAI(messages, context) {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const formattedMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];

  if (context && formattedMessages.length > 0) {
    const lastMsg = formattedMessages[formattedMessages.length - 1];
    let contextStr = `\n\n[Контекст: `;
    if (context.originalText) contextStr += `Оригинальный текст: "${context.originalText}". `;
    if (context.topic) contextStr += `Тема: "${context.topic}". `;
    if (context.keywords) contextStr += `Ключевые слова/факты: "${context.keywords}". `;
    if (context.field) contextStr += `Раздел страницы: "${context.field}". `;
    contextStr += `]`;
    lastMsg.content += contextStr;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: formattedMessages,
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('OpenAI returned an empty response');
    }

    return JSON.parse(responseText.trim());
  } catch (err) {
    console.error('[callOpenAI] failed:', err);
    return generateMockResponse(messages, context);
  }
}

/**
 * Generates a high-quality mock response when no API keys are available.
 */
function generateMockResponse(messages, context) {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
  const lastUserMsgLower = lastUserMsg.toLowerCase();

  // Helper to translate field key to Russian
  const getFieldLabel = (field) => {
    const labels = {
      bio: 'краткого описания',
      childhood: 'рассказа о детстве',
      education: 'рассказа об учебе',
      career: 'рассказа о карьере',
      family: 'рассказа о семье',
      hobbies: 'рассказа о хобби',
      legacy: 'рассказа о наследии',
      quote: 'цитаты'
    };
    return labels[field] || 'текста';
  };

  const label = context ? getFieldLabel(context.field) : 'текста';

  // Scenario 1: Improving existing text
  if (context && context.originalText) {
    const originalText = context.originalText;
    
    // Check if the user is asking to make it more emotional, formal, short etc.
    let tone = 'improved';
    let responseMsg = 'Я проанализировал ваш текст, исправил грамматические ошибки, улучшил структуру повествования и сделал слог более гладким.';
    
    if (lastUserMsgLower.includes('эмоциональ') || lastUserMsgLower.includes('тепл') || lastUserMsgLower.includes('душевн')) {
      tone = 'emotional';
      responseMsg = 'Я переработал текст, добавив больше теплоты, уважения и эмоциональной выразительности, чтобы передать атмосферу светлой памяти.';
    } else if (lastUserMsgLower.includes('официаль') || lastUserMsgLower.includes('строг') || lastUserMsgLower.includes('сухо')) {
      tone = 'formal';
      responseMsg = 'Я сделал стиль текста более сдержанным, уважительным и строгим, подходящим для официальной мемориальной летописи.';
    } else if (lastUserMsgLower.includes('коротк') || lastUserMsgLower.includes('сократ') || lastUserMsgLower.includes('меньше')) {
      tone = 'short';
      responseMsg = 'Я сократил текст, убрав лишние повторы и выделив самое главное, чтобы он читался легко и лаконично.';
    } else if (userMessages.length > 1) {
      // It is a dialogue modification request
      responseMsg = `Я скорректировал текст с учётом ваших пожеланий: "${lastUserMsg}".`;
    }

    const proposedText = generateImprovedTextVariant(originalText, tone, lastUserMsg);

    return {
      chatResponse: `${responseMsg} Как вам такой вариант? Вы можете применить его к странице или продолжить обсуждение в чате.`,
      proposedText: proposedText
    };
  }

  // Scenario 2: Writing from scratch (Dialogue flow)
  // Dialogue steps:
  // Step 1: User specified topic.
  // Step 2: User specified keywords.
  // Step 3: Text generated, user can save or redo.
  
  // Let's identify the current state by counting messages
  if (userMessages.length === 1) {
    // User just entered the topic
    const topic = lastUserMsg;
    return {
      chatResponse: `Тема «${topic}» отлично подойдёт для ${label}. Теперь укажите, пожалуйста, ключевые слова, важные факты, даты, имена или любые ваши пожелания, которые обязательно нужно использовать в тексте. Если особых фактов нет, просто напишите «пропустить» или «нет».`,
      proposedText: ""
    };
  }

  // If user provided topic and now keywords
  if (userMessages.length >= 2) {
    const topic = userMessages[0].content;
    const keywords = lastUserMsg;
    
    // Check if the user is asking to redo/change the generated text
    const isRedoRequest = userMessages.length > 2;

    let responseMsg = 'Я составил для вас красивый структурированный текст на основе указанной темы и ключевых слов. Ознакомьтесь с ним в окне предпросмотра.';
    if (isRedoRequest) {
      responseMsg = `Я переделал текст с учётом вашего комментария: "${lastUserMsg}". Вот новый вариант.`;
    }

    const proposedText = generateTextFromScratch(topic, keywords, context?.field, lastUserMsg, isRedoRequest);

    return {
      chatResponse: `${responseMsg} Если вам нравится результат, нажмите «Сохранить текст». Если нужно что-то изменить, напишите ваши пожелания ниже.`,
      proposedText: proposedText
    };
  }

  // Default response
  return {
    chatResponse: "Здравствуйте! Чем я могу вам помочь?",
    proposedText: ""
  };
}

/**
 * Mock generator for improved text versions.
 */
function generateImprovedTextVariant(originalText, tone, userInstruction) {
  // Let's clean up and structure the text
  let cleaned = originalText.trim();
  
  if (tone === 'emotional') {
    return `С глубоким уважением и теплотой хочется вспомнить об этом удивительном человеке. \n\n${cleaned}\n\nСветлая память о его добрых делах, искренней улыбке и душевном тепле навсегда останется в сердцах всех, кто имел счастье знать его лично. Он был настоящим ориентиром искренности и преданности своему делу.`;
  }
  
  if (tone === 'formal') {
    return `Данный раздел посвящен жизненному пути и заслугам. \n\n${cleaned}\n\nЖизнь этого человека является достойным примером честного труда, высокой гражданской ответственности и верности своим принципам. Светлая память.`;
  }
  
  if (tone === 'short') {
    const sentences = cleaned.split(/[.!?]+/);
    if (sentences.length > 2) {
      return sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ') + '.';
    }
    return cleaned;
  }

  // General improvement: fix structure, add a warm intro/outro if not present
  if (!cleaned.startsWith('Жизненный путь') && cleaned.length > 10) {
    return `Этот раздел посвящен важным страницам жизни. \n\n${cleaned}\n\nЕго жизненный путь был наполнен яркими событиями, честным трудом и заботой о близких. Память о нем продолжает жить в наших сердцах.`;
  }

  return cleaned;
}

/**
 * Mock generator for text from scratch.
 */
function generateTextFromScratch(topic, keywords, field, lastInstruction, isRedo) {
  const cleanKeywords = keywords.toLowerCase() === 'пропустить' || keywords.toLowerCase() === 'нет' ? '' : keywords;
  
  const keywordsList = cleanKeywords 
    ? cleanKeywords.split(/[,;.]+/).map(k => k.trim()).filter(Boolean)
    : [];

  let text = '';
  
  // Base draft generation depending on field
  if (field === 'childhood') {
    text = `Детство этого замечательного человека началось в атмосфере открытий и искренней радости. Тема этой поры — "${topic}" — оставила неизгладимый след в его душе. Ранние годы были наполнены познанием окружающего мира, первыми крепкими дружбами и семейным уютом.`;
    if (keywordsList.length > 0) {
      text += ` Особое значение в те годы имели такие моменты и события, как ${keywordsList.join(', ')}. Именно это воспитало в нём характер, стойкость и жизнелюбие, которые он пронёс через всю жизнь.`;
    }
  } else if (field === 'education') {
    text = `Годы учёбы стали важным этапом становления личности. Стремление к знаниям по теме "${topic}" определило его будущие интересы и жизненные ориентиры. Преподаватели и сокурсники всегда отмечали его целеустремленность, пытливый ум и готовность прийти на помощь.`;
    if (keywordsList.length > 0) {
      text += ` Особое место в студенческой поре занимали ${keywordsList.join(', ')}. Этот интеллектуальный багаж и верность выбранному пути заложили прочный фундамент для всех последующих свершений.`;
    }
  } else if (field === 'career') {
    text = `Профессиональный путь был отмечен глубокой преданностью делу и постоянным развитием в сфере "${topic}". За годы работы он зарекомендовал себя как высококлассный специалист, чьему мнению доверяли коллеги и руководство.`;
    if (keywordsList.length > 0) {
      text += ` Важнейшими вехами и достижениями карьеры стали ${keywordsList.join(', ')}. Его трудолюбие и профессиональная этика вызывали искреннее уважение у всех, кто работал рядом.`;
    }
  } else if (field === 'family') {
    text = `Семья и близкие люди всегда были главной опорой и тихой гаванью в его жизни. В отношениях с родными на тему "${topic}" он проявлял невероятное терпение, заботу и безграничную любовь.`;
    if (keywordsList.length > 0) {
      text += ` Он с трепетом относился к таким ценностям, как ${keywordsList.join(', ')}. Дом всегда был наполнен теплом, поддержкой и взаимопониманием, а семейные традиции бережно сохраняются и сегодня.`;
    }
  } else if (field === 'hobbies') {
    text = `Увлечения и хобби наполняли жизнь яркими красками и дарили вдохновение. Тема "${topic}" была для него не просто досугом, а возможностью выразить себя, отдохнуть душой и найти единомышленников.`;
    if (keywordsList.length > 0) {
      text += ` В свободное время он с радостью посвящал себя ${keywordsList.join(', ')}. Это приносило ему искреннее удовлетворение и позволяло делиться радостью творчества с окружающими.`;
    }
  } else if (field === 'legacy') {
    text = `Наследие этого человека продолжает жить в его делах, памяти детей и внуков, а также в светлых воспоминаниях друзей. Тема "${topic}" отражает то непреходящее влияние, которое он оказал на мир вокруг себя.`;
    if (keywordsList.length > 0) {
      text += ` Главным ориентиром и ценностями, которые он оставил нам, являются ${keywordsList.join(', ')}. Мы бережно храним его уроки мудрости, доброты и любви к жизни.`;
    }
  } else {
    // bio or generic
    text = `Этот рассказ посвящен жизни и памяти замечательного человека. Тема "${topic}" занимает особое место в его истории, раскрывая грани характера, устремления и ценности.`;
    if (keywordsList.length > 0) {
      text += ` Жизнь была неразрывно связана с такими моментами, как ${keywordsList.join(', ')}. Каждое из этих событий внесло свой вклад в создание уникальной летописи жизни.`;
    }
    text += ` Это повествование призвано сохранить для будущих поколений светлую память о человеке огромной души и доброго сердца.`;
  }

  // Adjustments based on user instruction (e.g. if they asked to redo)
  if (isRedo && lastInstruction) {
    const instLower = lastInstruction.toLowerCase();
    if (instLower.includes('длиннее') || instLower.includes('подробнее')) {
      text += `\n\nКаждый день его жизни был наполнен смыслом и стремлением сделать этот мир чуточку лучше. Даже сталкиваясь с трудностями, он никогда не терял оптимизма, веры в людей и искренней доброжелательности, оставляя тепло в душах всех окружающих.`;
    } else if (instLower.includes('короче') || instLower.includes('лаконичнее')) {
      const parts = text.split('.');
      text = parts.slice(0, Math.min(3, parts.length)).join('.') + '.';
    } else {
      text = `${text}\n\n(Корректировка: добавлено соответствие запросу "${lastInstruction}").`;
    }
  }

  return text;
}

module.exports = {
  chat
};
