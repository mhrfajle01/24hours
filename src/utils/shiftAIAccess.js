// Shift Tracker Action Bridge for Local AI
// Zero external token consumption, works directly with local shift tracker dataset

// Match ShiftTrackerPage BD (UTC+6) date logic exactly
const getTodayStr = () => {
  const d = new Date(Date.now() + 6 * 3600000);
  return d.toISOString().split('T')[0];
};

export const getShiftData = (uid) => {
  if (!uid) return null;
  const todayStr = getTodayStr();
  try {
    // 1. First check date-specific today storage
    const rawToday = localStorage.getItem(`shiftTracker_data_${uid}_${todayStr}`);
    if (rawToday) {
      const parsed = JSON.parse(rawToday);
      if (parsed && parsed.date === todayStr) return parsed;
    }

    // 2. Check general storage, but strictly verify that date === todayStr
    const rawGen = localStorage.getItem(`shiftTracker_data_${uid}`);
    if (rawGen) {
      const parsed = JSON.parse(rawGen);
      if (parsed && parsed.date === todayStr) {
        return parsed;
      }
    }

    // If date is different or not found, today has NO setup shift
    return null;
  } catch {
    return null;
  }
};

export const saveShiftData = (uid, data) => {
  if (!uid || !data) return false;
  const todayStr = getTodayStr();
  try {
    const updated = { ...data, date: todayStr };
    localStorage.setItem(`shiftTracker_data_${uid}_${todayStr}`, JSON.stringify(updated));
    localStorage.setItem(`shiftTracker_data_${uid}`, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
};

export const executeShiftAIAction = (query, uid) => {
  const rawQ = (query || '').trim();
  const q = rawQ.toLowerCase();
  const shift = getShiftData(uid);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 0. Slash Command: /shift open or /shift
  if (q === '/shift open' || q === '/shift page' || q === '/open shift') {
    return {
      handled: true,
      text: '🚀 Shift Tracker পেজে নিয়ে যাওয়া হচ্ছে...',
      action: 'open_shift'
    };
  }

  // 1. Slash Command: /shift report (Full detailed shift report)
  if (q === '/shift report' || q === '/report' || q === 'shift report' || q === 'রিপোর্ট' || q === 'শিফট রিপোর্ট') {
    if (!shift || !shift.blocks || shift.blocks.length === 0) {
      return {
        handled: true,
        text: '📋 আজ এখনও কোনো শিফট সেটআপ করা হয়নি।\n\nশিফট তৈরি করতে লিখুন: `/shift open`'
      };
    }

    const totalTarget = Number(shift.target) || 0;
    const totalActual = (shift.blocks || []).reduce((sum, b) => sum + (b.logged ? Number(b.actual || 0) : 0), 0);
    const progressPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    const isClockActive = shift.clockStatus === 'active';
    const isBreak = shift.clockStatus === 'break';
    const statusLabel = isBreak ? '☕ ব্রেকে আছেন' : isClockActive ? '🟢 চলমান শিফট' : '⏸️ স্থগিত';

    // Break details
    const totalBreakMinutes = Math.round((shift.totalBreakAccumulatedMs || 0) / 60000);

    // Block breakdown
    let blockList = '';
    (shift.blocks || []).forEach((b, i) => {
      const timeSlot = `${b.start}-${b.end}`;
      if (b.isBreak) {
        blockList += `   ${i + 1}. [${timeSlot}] ☕ ব্রেক\n`;
      } else if (b.logged) {
        const diff = Number(b.actual || 0) - Number(b.target || 0);
        const diffIcon = diff >= 0 ? `+${diff}` : `${diff}`;
        const mark = b.actual >= b.target ? '✅' : '⚠️';
        blockList += `   ${i + 1}. [${timeSlot}] ${mark} ${b.actual}/${Math.round(b.target)} (${diffIcon})\n`;
      } else {
        blockList += `   ${i + 1}. [${timeSlot}] ⏳ বাকি (${Math.round(b.target)})\n`;
      }
    });

    const reportCard = 
`╔════════════════════════════╗
   📋 DAILY SHIFT REPORT (${shift.date || getTodayStr()})
╚════════════════════════════╝
• অবস্থা: ${statusLabel}
• সময়সূচী: ${shift.shiftStart || 'N/A'} - ${shift.shiftEnd || 'N/A'}
• অগ্রগতি: ${progressPct}% [${totalActual} / ${totalTarget} ${shift.unit || 'pcs'}]
• মোট ব্রেক: ${totalBreakMinutes} মিনিট

⏱️ প্রতি ঘণ্টার পারফরম্যান্স:
${blockList.trimEnd()}
─────────────────────────────
💡 নতুন প্রডাকশন যোগ করতে: \`/shift add [সংখ্যা]\``;

    return {
      handled: true,
      text: reportCard
    };
  }

  // 1.1 Slash Command: /shift status or /shift
  if (q === '/shift status' || q === '/shift' || q === '/status' ||
      /^(status|shift|shift status|রিপোর্ট|অবস্থা|শিফটের খবর|summary)/i.test(q) ||
      q.includes('shift status') || q.includes('শিফটের অবস্থা') || q.includes('আজকের শিফট')) {
    if (!shift || !shift.blocks || shift.blocks.length === 0) {
      return {
        handled: true,
        text: '📋 আজ এখনও কোনো শিফট সেটআপ বা শুরু করা হয়নি।\n\nআপনি চাইলে `/shift open` লিখে শিফট তৈরি করতে পারেন।'
      };
    }

    const totalTarget = Number(shift.target) || 0;
    const totalActual = (shift.blocks || []).reduce((sum, b) => sum + (b.logged ? Number(b.actual || 0) : 0), 0);
    const loggedCount = (shift.blocks || []).filter(b => b.logged && !b.isBreak).length;
    const totalBlocks = (shift.blocks || []).filter(b => !b.isBreak).length;
    const isClockActive = shift.clockStatus === 'active';
    const isBreak = shift.clockStatus === 'break';

    const statusBadge = isBreak ? '☕ ব্রেকে আছেন' : isClockActive ? '🟢 রানিং শিফট' : '⏸️ শিফট স্থগিত/আইডল';

    return {
      handled: true,
      text: `📊 *আজকের শিফট সামারি* (${statusBadge})\n` +
            `• মোট টার্গেট: ${totalTarget} ${shift.unit || 'pieces'}\n` +
            `• সম্পন্ন প্রোডাকশন: ${totalActual} ${shift.unit || 'pieces'}\n` +
            `• সম্পন্ন ব্লক: ${loggedCount} / ${totalBlocks}\n` +
            `• শিফট শিডিউল: ${shift.shiftStart || 'N/A'} - ${shift.shiftEnd || 'N/A'}`
    };
  }

  // 2. Slash Command: /shift start
  if (q === '/shift start' || /start shift|clock in|শিফট শুরু|কাজ শুরু/i.test(q)) {
    if (!shift || !shift.blocks || shift.blocks.length === 0) {
      return {
        handled: true,
        text: '⚠️ কোনো শিফট শিডিউল খুঁজে পাওয়া যায়নি। প্রথমে `/shift open` দিয়ে শিফট জেনারেট করুন।'
      };
    }
    if (shift.clockStatus === 'active') {
      return {
        handled: true,
        text: `🟢 আপনার শিফট ইতিমধ্যে চলছে (শুরু হয়েছে: ${shift.shiftStart || timeStr})।`
      };
    }

    shift.clockStatus = 'active';
    shift.shiftStartMs = shift.shiftStartMs || Date.now();
    saveShiftData(uid, shift);
    return {
      handled: true,
      text: `✅ শিফট সফলভাবে শুরু হয়েছে (${timeStr})! ভালো কাজের শুভকামনা।`
    };
  }

  // 3. Slash Command: /shift break (Toggles break or starts it)
  if (q === '/shift break' || q === '/break' || /take break|start break|ব্রেক শুরু|ব্রেক নাও|চা খাব|নাস্তা/i.test(q)) {
    if (!shift || shift.clockStatus === 'idle') {
      return {
        handled: true,
        text: '⚠️ বর্তমানে কোনো সক্রিয় শিফট চালু নেই। ব্রেক নেওয়ার জন্য আগে শিফট শুরু থাকতে হবে।'
      };
    }

    // Toggle: if already in break, then end break
    if (shift.clockStatus === 'break') {
      const breakDuration = shift.breakStartMs ? (Date.now() - shift.breakStartMs) : 0;
      shift.clockStatus = 'active';
      shift.totalBreakAccumulatedMs = (shift.totalBreakAccumulatedMs || 0) + breakDuration;
      shift.breakStartMs = null;
      saveShiftData(uid, shift);
      return {
        handled: true,
        text: `🟢 ব্রেক শেষ হয়েছে! কাজ পুনরায় চালু করা হয়েছে (${timeStr})।`
      };
    }

    // Otherwise start break
    shift.clockStatus = 'break';
    shift.breakStartMs = Date.now();
    shift.breakType = 'tea';
    saveShiftData(uid, shift);
    return {
      handled: true,
      text: `☕ ব্রেক শুরু হয়েছে (${timeStr})। পুনরায় কাজে ফিরতে লিখুন: \`/shift resume\` বা \`/shift break\``
    };
  }

  // 4. Slash Command: /shift resume or /shift endbreak
  if (q === '/shift resume' || q === '/shift endbreak' || /end break|resume shift|ব্রেক শেষ|কাজে ফিরি|ব্রেক অফ/i.test(q)) {
    if (!shift || shift.clockStatus !== 'break') {
      return {
        handled: true,
        text: 'ℹ️ আপনি বর্তমানে কোনো ব্রেকে নেই।'
      };
    }
    const breakDuration = shift.breakStartMs ? (Date.now() - shift.breakStartMs) : 0;
    shift.clockStatus = 'active';
    shift.totalBreakAccumulatedMs = (shift.totalBreakAccumulatedMs || 0) + breakDuration;
    shift.breakStartMs = null;
    saveShiftData(uid, shift);
    return {
      handled: true,
      text: `🟢 ব্রেক শেষ হয়েছে! কাজ পুনরায় চালু করা হয়েছে (${timeStr})।`
    };
  }

  // 4.5 Slash Command: /shift reason <reason text>
  const reasonMatch = q.match(/^\/shift\s+reason\s+(.+)/i);
  if (reasonMatch) {
    const reasonText = reasonMatch[1].trim();
    if (!shift || !shift.blocks || shift.blocks.length === 0) {
      return {
        handled: true,
        text: '⚠️ কোনো শিফট ডাটা পাওয়া যায়নি।'
      };
    }

    // Find the latest logged block that missed target without a reason or update the last missed block
    const missedBlock = shift.blocks.find(b => !b.isBreak && b.logged && b.actual < b.target && !b.missReason) ||
                        [...shift.blocks].reverse().find(b => !b.isBreak && b.logged && b.actual < b.target);

    if (missedBlock) {
      missedBlock.missReason = reasonText;
      saveShiftData(uid, shift);
      return {
        handled: true,
        text: `📝 [${missedBlock.start} - ${missedBlock.end}] ব্লকের কারণ সেট করা হয়েছে:\n📌 "${reasonText}"`
      };
    } else {
      return {
        handled: true,
        text: 'ℹ️ বর্তমানে কোনো মিস হওয়া ব্লক পাওয়া যায়নি যার কারণ সেট করা প্রয়োজন।'
      };
    }
  }

  // 5. Slash Command: /shift add <num> [optional reason] (e.g. /shift add 15 or /shift add 15 Machine delay)
  const slashAddMatch = q.match(/^\/shift\s+add\s+(\d+)(?:\s+(.+))?/i);
  const prodMatch = slashAddMatch || q.match(/(?:add|যোগ|পিস|উৎপাদন|piece|pieces)?\s*(\d+)\s*(?:pieces|পিস|যোগ|add)?/i);

  if (slashAddMatch || (prodMatch && (q.includes('add') || q.includes('পিস') || q.includes('piece') || q.includes('যোগ') || q.includes('উৎপাদন')))) {
    const qty = parseInt(prodMatch[1], 10);
    const inlineReason = slashAddMatch && slashAddMatch[2] ? slashAddMatch[2].trim() : null;

    if (!shift || !shift.blocks || shift.blocks.length === 0) {
      return {
        handled: true,
        text: '⚠️ কোনো সক্রিয় শিফট পাওয়া যায়নি। প্রডাকশন এন্ট্রি দিতে আগে শিফট ট্র্যাকারে শিফট শুরু করুন।'
      };
    }

    let targetBlock = shift.blocks.find(b => !b.isBreak && !b.logged);
    if (!targetBlock) {
      targetBlock = [...shift.blocks].reverse().find(b => !b.isBreak);
    }

    if (targetBlock) {
      const prevActual = targetBlock.logged ? Number(targetBlock.actual || 0) : 0;
      const newActual = prevActual + qty;
      targetBlock.actual = newActual;
      targetBlock.logged = true;

      const targetVal = Number(targetBlock.target || 0);
      const isTargetAchieved = newActual >= targetVal;

      // Handle missed target reason logic
      if (!isTargetAchieved) {
        if (inlineReason) {
          targetBlock.missReason = inlineReason;
        } else if (!targetBlock.missReason) {
          // Default logical missed reason
          targetBlock.missReason = 'Low productivity / Pending reason';
        }
      } else {
        // If target achieved, no missReason needed
        targetBlock.missReason = '';
      }

      saveShiftData(uid, shift);

      if (isTargetAchieved) {
        return {
          handled: true,
          text: `🎉 *অভিনন্দন! ব্লকের টার্গেট সম্পন্ন!*\n` +
                `• স্লট: [${targetBlock.start} - ${targetBlock.end}]\n` +
                `• প্রোডাকশন: ${newActual} / ${Math.round(targetVal)} ${shift.unit || 'pieces'} (+${qty} যোগ হয়েছে)`
        };
      } else {
        const shortage = Math.round(targetVal - newActual);
        const reasonText = targetBlock.missReason || 'Low productivity';
        return {
          handled: true,
          text: `⚠️ *টার্গেট পূরণ হয়নি!* (${shortage} ${shift.unit || 'pieces'} ঘাটতি)\n` +
                `• স্লট: [${targetBlock.start} - ${targetBlock.end}]\n` +
                `• প্রোডাকশন: ${newActual} / ${Math.round(targetVal)} ${shift.unit || 'pieces'}\n` +
                `• শিফট ট্র্যাকারে কারণ যুক্ত করা হয়েছে: *"${reasonText}"*\n\n` +
                `💡 নির্দিষ্ট কোনো কারণ দিতে লিখুন: \`/shift reason [আপনার কারণ]\``
        };
      }
    }
  }

  return { handled: false };
};
