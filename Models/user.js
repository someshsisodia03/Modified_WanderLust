const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const userSignupLogin = new mongoose.Schema({
    email: {
        type: String,
        required: true
    }
});
userSignupLogin.plugin(passportLocalMongoose);
const user = mongoose.model("user", userSignupLogin);
module.exports = user;
