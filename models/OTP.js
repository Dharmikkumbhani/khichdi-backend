const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    mobileNumber: {
        type: String,
        required: true,
    },
    otp: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 500
    }
});

module.exports = mongoose.model('OTP', otpSchema);
