const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
    mobileNumber: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
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
    price: {
        type: Number,
        default: 0
    },
    description: {
        type: String,
        default: ""
    },
    address: {
        type: String,
        default: ""
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    imageUrl: {
        type: String,
        default: ""
    },
    photos: {
        type: [String],
        default: []
    },
    hotelType: {
        type: String,
        enum: ["fixed", "dynamic"],
        default: "dynamic"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Hotel', hotelSchema);
