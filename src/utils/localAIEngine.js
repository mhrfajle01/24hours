// Local AI Knowledge Search & Inference Engine
// Supports zero-cost, high-capacity JSON knowledge base with vector-like semantic matching

const AI_STORAGE_KEY = 'local_ai_knowledge_base';

export const getLocalAIKnowledge = () => {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefaultKnowledge();
  } catch {
    return getDefaultKnowledge();
  }
};

export const saveLocalAIKnowledge = (data) => {
  try {
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save AI Knowledge:', e);
    return false;
  }
};

export const queryLocalAI = (userQuery, knowledgeBase) => {
  const kb = knowledgeBase || getLocalAIKnowledge();
  if (!userQuery || !userQuery.trim()) return 'Please ask a question!';
  if (!Array.isArray(kb) || kb.length === 0) return 'I am currently updating my knowledge base. Please check back shortly.';

  const cleanQuery = userQuery.toLowerCase().trim();
  
  // Greetings / Small talk handling
  const greetings = ['hi', 'hello', 'hey', 'হ্যালো', 'হাই', 'সালাম', 'salam', 'assalamu alaikum', 'assalamualaikum'];
  if (greetings.includes(cleanQuery)) {
    return 'হ্যালো! আমি MHR BOT। আপনাকে কীভাবে সাহায্য করতে পারি?';
  }

  const queryTokens = cleanQuery.split(/[\s,।?.!+-]+/).filter(Boolean);

  let bestMatch = null;
  let highestScore = 0;

  for (const item of kb) {
    let score = 0;
    const keywords = (item.keywords || []).map(k => String(k).toLowerCase());
    const topic = (item.topic || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();

    // 1. Exact topic or complete phrase match
    if (topic === cleanQuery) score += 25;
    else if (cleanQuery.length >= 4 && topic.includes(cleanQuery)) score += 15;

    // 2. Keyword exact matching (tokens must match whole keywords or query words)
    for (const token of queryTokens) {
      if (token.length <= 1) continue; // ignore single letters
      if (keywords.includes(token)) {
        score += 10;
      } else if (keywords.some(k => k.length > 2 && (k.includes(token) || token.includes(k)))) {
        score += 4;
      }
      if (topic.split(/\s+/).includes(token)) score += 6;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  // Strict confidence check: must have solid keyword/topic match
  if (bestMatch && highestScore >= 10) {
    return bestMatch.answer;
  }

  // Low-token Bengali fallback
  return 'দুঃখিত, আমি বুঝতে পারিনি। দয়া করে আরেকটু সহজ বা বিস্তারিতভাবে লিখুন।';
};

export const getDefaultKnowledge = () => [
  {
    topic: '24Hours Overview',
    keywords: ['24hours', 'overview', 'কী', 'অ্যাপ', 'app', 'সম্পর্কে'],
    answer: '24Hours একটি অল-ইন-ওয়ান লাইফ ট্র্যাকার। এতে রয়েছে Hourly Time Blocking, Shift Tracker, Wallet, Quick Bazar, streaks এবং আরও অনেক ফিচার।'
  },
  {
    topic: 'Shift Tracker',
    keywords: ['shift', 'tracker', 'শিফট', 'ব্রেক', 'break', 'production'],
    answer: 'শিফট ট্র্যাকারে আপনি আপনার দৈনিক কাজের সময়, ঘণ্টাভিত্তিক টার্গেট, প্রোডাকশন এবং ব্রেক হিস্ট্রি নিখুঁতভাবে পরিচালনা করতে পারবেন।'
  },
  {
    topic: 'Wallet & Savings',
    keywords: ['wallet', 'money', 'টাকা', 'সেভিংস', 'savings', 'ব্যয়'],
    answer: 'ওয়ালেটে আপনি মাল্টিপল ওয়ালেট তৈরি করতে পারেন এবং সেভিংস গোলস সেট করে সহজেই আয় ও ব্যয়ের সুনির্দিষ্ট রেকর্ড রাখতে পারবেন।'
  }
];
