require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.API_KEY;
const MONGO_URI = process.env.MONGO_URI;

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token, { polling: true });
const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const { default: axios } = require('axios');
const { messageText, getPagination } = require('./templates');
const { Users } = require('./models/users');

// ===================== Connection with DB and express =====================
app.use(express.json({ limit: '100mb' }));
app.use(cors());

mongoose.set('strictQuery', false);
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to MongoDB...');
  });

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
// ===========================================================================

bot.onText(/\/start/, async (msg) => {
  askLocation(msg);
  sendLocationToDB(msg);
});

async function sendLocationToDB(msg) {
  const isAvailableUser = await Users.findOne({ user_id: msg.from.id });
  if (isAvailableUser) return;

  try {
    const user = new Users({
      name: msg.from.first_name,
      username: msg.from.username,
      user_id: msg.from.id,
    });

    await user.save();
  } catch (ex) {
    console.log(ex);
  }
}

function askLocation(msg) {
  const opts = {
    reply_markup: JSON.stringify({
      keyboard: [[{ text: "Geolakatsyani jo'natish", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    }),
  };
  bot.sendMessage(msg.from.id, "Iltimos geolakatsyangizni jo'nating", opts);
}

async function getPlaceName(msg, isNewLocation) {
  const user = await Users.findOne({
    user_id: msg.from.id,
  });
  if (!user) return;

  if (isNewLocation) {
    user.location = msg.location;
    await user.save();
  }

  const opts = {
    reply_markup: JSON.stringify({
      keyboard: [
        [{ text: 'Oziq ovqat' }, { text: 'Supermarket' }],
        [{ text: 'Maktab' }, { text: 'Dorixona' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    }),
  };

  return bot.sendMessage(
    msg.from.id,
    `Salom ${
      msg.from.first_name || msg.from.username || '!'
    }, Iltimos bormoqchi bo'lgan manzilingizni tanlang yoki o'zing hohlagan manzilingizni yozing !`,
    opts
  );
}

bot.on('location', (msg) => getPlaceName(msg, true));

bot.onText(/^[^/*].*/, async (msg) => {
  const user = await Users.findOne({
    user_id: msg.from.id,
    location: { $exists: true },
  });

  if (!user) {
    askLocation(msg);
    sendLocationToDB(msg);
    return;
  }

  user.place = msg.text;
  await user.save();

  console.log(msg);
  nearbySearch(msg);
});

bot.on('callback_query', function (message) {
  const msg = message.message;

  if (message.data == 'prev') {
    bot.answerCallbackQuery(message.id, {
      text: 'Siz allaqachon birinchi sahifadasiz!',
      show_alert: true,
    });
    return;
  } else if (message.data == 'last') {
    bot.answerCallbackQuery(message.id, {
      text: 'Siz allaqachon oxirgi sahifadasiz!',
      show_alert: true,
    });
    return;
  } else if (message.data == 'back') {
    bot.answerCallbackQuery(message.id, {
      text: 'Ortga qaytmoqda!',
      show_alert: false,
    });
    bot.deleteMessage(msg.chat.id, msg.message_id);
    getPlaceName(message);
    return;
  } else if (message.data == 'same') {
    return;
  }

  nearbySearch(msg, message.data, true);
});

async function nearbySearch(msg, index, isForEdit) {
  const user = await Users.findOne({
    user_id: isForEdit ? msg.chat.id : msg.from.id,
  });

  if (!user.location || !user.place) return;
  if (!index) {
    index = 0;
  } else {
    index--;
  }

  const config = {
    method: 'get',
    url: `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${user.location.latitude}%2C${user.location.longitude}8&radius=1800&type=${user.place}&keyword=${user.place}&key=${API_KEY}`,
    headers: {},
  };

  const res = await axios(config).catch((err) => console.log(err));
  if (!res.data['results'][index]) {
    return bot.sendMessage(
      msg.chat.id,
      `Afsuski bu joy yaqin atrofda topilmadi 😔`,
      {
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: `Ortga qaytish`, callback_data: 'back' }]],
        }),
      }
    );
  }

  const currentPlaceId = res.data['results'][index].place_id;
  const maxLen = res.data['results'].length;
  return searchDetails(currentPlaceId, msg, index, maxLen, isForEdit);
}

async function searchDetails(currentPlaceId, msg, index, maxLen, isForEdit) {
  const res = await axios({
    method: 'get',
    url: `https://maps.googleapis.com/maps/api/place/details/json?place_id=${currentPlaceId}&fields=name%2Crating%2Cformatted_address%2Cformatted_phone_number%2Cphotos%2Cgeometry%2Curl%2Copening_hours&key=${API_KEY}`,
    headers: {},
  });

  if (isForEdit) {
    editForNextRequest(res.data.result, maxLen, index + 1, msg);
  } else {
    callback(res.data.result, maxLen, index + 1, msg);
  }

  return res.data.result;
}

async function editForNextRequest(data, maxLen, index, msg) {
  const photo = data.photos ? data.photos[0]['photo_reference'] : '';
  const editOptions = Object.assign(
    {},
    getPagination(parseInt(index), maxLen, data),
    {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
    }
  );
  try {
    bot.editMessageMedia(
      {
        type: 'photo',
        media: photo
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo}&key=${API_KEY}`
          : 'https://static.vecteezy.com/system/resources/previews/005/337/799/original/icon-image-not-found-free-vector.jpg',
        caption: messageText(data),
      },
      editOptions
    );
  } catch (error) {
    console.log(error);
  }
}

async function callback(data, maxLen, index, msg) {
  const photo = data.photos ? data.photos[0]['photo_reference'] : '';
  const messageEnter = Object.assign(
    {},
    getPagination(parseInt(index), maxLen, data),
    {
      caption: messageText(data),
    }
  );
  bot.sendPhoto(
    msg.chat.id,
    photo
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo}&key=${API_KEY}`
      : 'https://static.vecteezy.com/system/resources/previews/005/337/799/original/icon-image-not-found-free-vector.jpg',
    messageEnter
  );
}
