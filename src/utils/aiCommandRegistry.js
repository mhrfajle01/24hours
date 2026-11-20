// Central Registry for all Local AI Slash Commands
// Easily extendable in future: just add new command objects here!

export const BOT_COMMANDS = [
  // General / Helper commands
  {
    cmd: '/command run',
    aliases: ['/commands', '/help'],
    category: 'System',
    desc: 'সবগুলো কমান্ডের তালিকা ও ব্যবহারবিধি দেখুন'
  },
  {
    cmd: '/clear',
    aliases: ['/cls'],
    category: 'System',
    desc: 'চ্যাট হিস্ট্রি মুছে ফেলুন'
  },

  // Shift Tracker commands
  {
    cmd: '/shift status',
    aliases: ['/status', '/shift'],
    category: 'Shift Tracker',
    desc: 'আজকের শিফটের লাইভ অবস্থা ও সামারি'
  },
  {
    cmd: '/shift report',
    aliases: ['/report'],
    category: 'Shift Tracker',
    desc: 'প্রতিটি ঘণ্টার বিস্তারিত প্রোডাকশন ও শিফট রিপোর্ট'
  },
  {
    cmd: '/shift start',
    aliases: ['/clockin'],
    category: 'Shift Tracker',
    desc: 'বর্তমান সময়ে শিফট শুরু করুন'
  },
  {
    cmd: '/shift break',
    aliases: ['/break'],
    category: 'Shift Tracker',
    desc: 'ব্রেক শুরু অথবা ব্রেক শেষ করুন'
  },
  {
    cmd: '/shift resume',
    aliases: ['/endbreak'],
    category: 'Shift Tracker',
    desc: 'ব্রেক সম্পন্ন করে কাজে ফিরুন'
  },
  {
    cmd: '/shift add ',
    aliases: [],
    category: 'Shift Tracker',
    desc: 'প্রডাকশন যোগ (যেমন: /shift add 15 Machine breakdown)'
  },
  {
    cmd: '/shift reason ',
    aliases: [],
    category: 'Shift Tracker',
    desc: 'মিস হওয়া ব্লকের কারণ সেট করুন (যেমন: /shift reason Machine issue)'
  },
  {
    cmd: '/shift open',
    aliases: ['/shift page'],
    category: 'Shift Tracker',
    desc: 'Shift Tracker পেইজে সরাসরি প্রবেশ করুন'
  }
];

// Returns a formatted command list response
export const formatAllCommandsHelp = () => {
  const grouped = {};
  BOT_COMMANDS.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  let text = '⚡ *Available AI Slash Commands*\n\n';
  Object.keys(grouped).forEach(cat => {
    text += `📂 *${cat}*:\n`;
    grouped[cat].forEach(c => {
      text += `• \`${c.cmd}\` — ${c.desc}\n`;
    });
    text += '\n';
  });
  text += '💡 যেকোনো কমান্ড টাইপ করতে শুরু করলেই সাজেশন পেয়ে যাবেন।';
  return text.trim();
};
