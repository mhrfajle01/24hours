// TextMeBot & Meta Cloud Hybrid Direct WhatsApp Dispatcher

export const sendWhatsAppBlockAlert = async (blockData) => {
  try {
    const isEnabled = localStorage.getItem('wa_notify_enabled') === 'true';
    const rawNumber = localStorage.getItem('wa_notify_number') || '';
    const textMeBotApiKey = localStorage.getItem('textmebot_apikey') || '';

    if (!isEnabled || !rawNumber || !blockData) return;

    // Format target BD phone number: ensure country code +880 or 880
    let phone = rawNumber.trim().replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '880' + phone.substring(1);
    } else if (!phone.startsWith('880')) {
      phone = '880' + phone;
    }

    const planText = blockData.plan || blockData.description || 'কোনো প্ল্যান সেট করা নেই';
    const timeText = blockData.timeRange || blockData.hour || '';
    const tagText = blockData.tag || 'Regular';

    const messageText = `🔔 *24Hours - অ্যাক্টিভ টাইম ব্লক শুরু!*

⏰ *সময়:* ${timeText}
📌 *প্ল্যান:* ${planText}
🏷 *ট্যাগ:* ${tagText}

🎯 ফোকাস রাখুন এবং টাস্কটি সম্পন্ন করুন!`;

    const encodedMsg = encodeURIComponent(messageText);

    // Method 1: TextMeBot API (Direct Silent Message via Webhook)
    if (textMeBotApiKey) {
      const textMeUrl = `https://api.textmebot.com/send.php?recipient=+${phone}&apikey=${textMeBotApiKey}&text=${encodedMsg}`;
      fetch(textMeUrl, { mode: 'no-cors' }).catch(() => {});
      return;
    }

    // Method 2: Direct WhatsApp Mobile Intent fallback (instant trigger)
    const directAppUrl = `whatsapp://send?phone=${phone}&text=${encodedMsg}`;
    window.location.href = directAppUrl;
  } catch (e) {
    console.error('WhatsApp notify error:', e);
  }
};
