const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  username: {
    type: String,
  },
  user_id: {
    type: String,
    required: true,
    unique: true,
  },
  place: {
    type: String,
  },
  selectedRadius: {
    type: Number,
  },
  location: {
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
  },
});

const Users = mongoose.model('users', userSchema);

exports.Users = Users;
