const { Users } = require('../models/users');

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

module.exports.sendLocationToDB = sendLocationToDB;
