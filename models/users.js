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
  },
  place: {
    type: String,
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

// latitude: {
//   type: Number,
//   required: true,
// },
// longitude: {
//   type: Number,
//   required: true,
// },

const Users = mongoose.model('users', userSchema);

exports.Users = Users;
