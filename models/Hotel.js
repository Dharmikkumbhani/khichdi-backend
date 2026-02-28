const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
    mobileNumber: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: false
    },
    hotelName: {
        type: String,
        required: false,
        index: true
    },
    role: {
        type: String,
        default: "hotel"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Hotel', hotelSchema);
