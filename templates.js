function messageText(data) {
  const message =
    `🔎 ${data.name}` +
    `\n\n⭐ Rating ${data.rating || "ko'rsatilmagan"} ` +
    `\n\n📞 Telefon raqam ${data.phone_number || "ko'rsatilmagan"}` +
    `\n\n${
      data.opening_hours
        ? data.opening_hours.open_now
          ? '✅ Ayni damda ochiq'
          : '❌ Ayni damda yopiq'
        : ''
    } ` +
    `\n\n📍 ${data.formatted_address || ''} - ${data.url || ''}`;
  return message;
}

function getPagination(current, maxpage, data) {
  let keys = [];
  if (current == 1) keys.push({ text: `⛔️`, callback_data: 'prev' });
  if (current > 1)
    keys.push({ text: `⬅️`, callback_data: (current - 1).toString() });
  keys.push({
    text: `${current}/${maxpage}`,
    callback_data: current.toString(),
  });
  if (current == maxpage) keys.push({ text: `⛔️`, callback_data: 'last' });
  if (current < maxpage)
    keys.push({ text: `➡️`, callback_data: (current + 1).toString() });

  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        keys,
        [{ text: `Ortga qaytish`, callback_data: 'back' }],
      ],
    }),
  };
}

module.exports.getPagination = getPagination;
module.exports.messageText = messageText;
