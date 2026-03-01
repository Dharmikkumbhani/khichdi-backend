const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
        index: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Date, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// To prevent duplicate subscriptions for the same device and hotel
subscriptionSchema.index({ hotelId: 1, 'subscription.endpoint': 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
