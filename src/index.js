require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token);
const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const { messageText, getPagination } = require('./templates');
const { Users } = require('./models/users');
const { sendLocationToDB } = require('./services/sendLocationToDB');
const { default: axios } = require('axios');
const {
  calculateDistance,
  calculateDistanceForSort,
} = require('./utils/calculateDistance');

// Connection with DB and express
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

app.post('/notification', async (req, res) => {
  if (req.query.token !== token) return res.send('Token is invalid');

  if (JSON.stringify(req.body) === '{}')
    return res.status(400).send('Data is not provided in body');

  if (req.body.message === '') return res.send('message is empty').status(400);

  const result = await pushNotification(req.body);
  res.send(result);
});

bot.setWebHook(`${WEBHOOK_URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Telegram bot
bot.onText(/\/start/, async (msg) => {
  askLocation(msg);
  sendLocationToDB(msg);
});

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

  askRadius(msg);
});

bot.on('callback_query', function (message) {
  const msg = message.message;

  switch (message.data) {
    case 'prev':
      bot.answerCallbackQuery(message.id, {
        text: 'Siz allaqachon birinchi sahifadasiz!',
        show_alert: true,
      });
      break;

    case 'last':
      bot.answerCallbackQuery(message.id, {
        text: 'Siz allaqachon oxirgi sahifadasiz!',
        show_alert: true,
      });
      break;

    case 'back':
      bot.answerCallbackQuery(message.id, {
        text: 'Ortga qaytmoqda!',
        show_alert: false,
      });
      bot.deleteMessage(msg.chat.id, msg.message_id);
      getPlaceName(message);
      break;

    case '1000':
      searchNearby(
        { from: message.from, chat: message.from },
        0,
        false,
        message.data
      );
      bot.deleteMessage(msg.chat.id, msg.message_id);
      break;

    case '3000':
      searchNearby(
        { from: message.from, chat: message.from },
        0,
        false,
        message.data
      );
      bot.deleteMessage(msg.chat.id, msg.message_id);
      break;

    case '5000':
      searchNearby(
        { from: message.from, chat: message.from },
        0,
        false,
        message.data
      );
      bot.deleteMessage(msg.chat.id, msg.message_id);
      break;

    case '10000':
      searchNearby(
        { from: message.from, chat: message.from },
        0,
        false,
        message.data
      );
      bot.deleteMessage(msg.chat.id, msg.message_id);
      break;

    case 'same':
      break;

    default:
      searchNearby(msg, message.data, true);
  }
});

bot.onText(/\/stop/, async (msg) => {
  await Users.deleteOne({ user_id: msg.chat.id });
});

function askRadius(msg) {
  const opts = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: `1km`, callback_data: '1000' },
          { text: `3km`, callback_data: '3000' },
          { text: `5km`, callback_data: '5000' },
          { text: `10km`, callback_data: '10000' },
        ],
      ],
    }),
  };
  bot.sendMessage(
    msg.chat.id,
    'Necha kilometr radius ichida qidirmoqchisiz',
    opts
  );
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

async function pushNotification({ message, image }) {
  const usersIds = await Users.find().select('user_id name -_id');

  for (const id of usersIds) {
    bot.sendPhoto(id.user_id, image, {
      parse_mode: 'Markdown',
      caption: message,
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: `Sinab ko'rish`, callback_data: 'back' }]],
      }),
    });
  }

  return 'Notification sent to users successfully';
}

async function searchNearby(msg, index, isForEdit, radius) {
  const user = await Users.findOne({
    user_id: isForEdit ? msg.chat.id : msg.from.id,
  });

  if (radius) {
    user.selectedRadius = radius;
    user.save();
  }

  if (!user.location || !user.place) return;
  if (!index) {
    index = 0;
  } else {
    index--;
  }

  const config = {
    method: 'get',
    url: `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${
      user.location.latitude
    }%2C${user.location.longitude}8&radius=${
      radius || user.selectedRadius
    }&type=${user.place}&keyword=${user.place}&key=${API_KEY}`,
    headers: {},
  };

  const res = await axios(config).catch((err) => console.log(err));
  if (!res.data['results'][index]) {
    return notFound(msg);
  }

  const results = res.data.results;

  for (let i = 0; i < results.length; i++) {
    const { lat, lng } = results[i].geometry.location;
    const { latitude, longitude } = user.location;
    results[i].distance = calculateDistanceForSort(
      lat,
      lng,
      latitude,
      longitude
    );
  }

  results.sort((a, b) => {
    return a.distance - b.distance;
  });

  const currentPlaceId = results[index].place_id;
  const maxLen = results.length;
  return searchDetails(
    currentPlaceId,
    user.location,
    msg,
    index,
    maxLen,
    isForEdit
  );
}

async function searchDetails(
  currentPlaceId,
  userLocation,
  msg,
  index,
  maxLen,
  isForEdit
) {
  const res = await axios({
    method: 'get',
    url: `https://maps.googleapis.com/maps/api/place/details/json?place_id=${currentPlaceId}&fields=name%2Crating%2Cformatted_address%2Cformatted_phone_number%2Cphotos%2Cgeometry%2Curl%2Copening_hours&key=${API_KEY}`,
    headers: {},
  });

  const { lat, lng } = res.data.result.geometry.location;

  res.data.result.distanceDetails = calculateDistance(
    userLocation.latitude,
    lat,
    userLocation.longitude,
    lng
  );

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
    await bot.editMessageMedia(
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
    return;
  }
}

function callback(data, maxLen, index, msg) {
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

function notFound(msg) {
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

exports.callback = callback;
