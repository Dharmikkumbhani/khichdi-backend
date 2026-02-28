const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
        index: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    note: {
        type: String,
        default: ''
    },
    date: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('Menu', menuSchema);
