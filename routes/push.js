const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const Subscription = require('../models/Subscription');
const Hotel = require('../models/Hotel');

// Configure web-push with VAPID keys
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Route to get VAPID public key
router.get('/vapidPublicKey', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Route to subscribe to push notifications for a specific hotel
router.post('/subscribe', async (req, res) => {
    try {
        const { hotelId, subscription } = req.body;

        if (!hotelId || !subscription) {
            return res.status(400).json({ error: 'hotelId and subscription are required' });
        }

        // Verify hotel exists
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ error: 'Hotel not found' });
        }

        // Save or update subscription
        const newSubscription = await Subscription.findOneAndUpdate(
            { hotelId, 'subscription.endpoint': subscription.endpoint },
            { hotelId, subscription },
            { upsert: true, new: true }
        );

        res.status(201).json({ message: 'Subscribed successfully', subscription: newSubscription });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Route to unsubscribe from push notifications
router.post('/unsubscribe', async (req, res) => {
    try {
        const { hotelId, endpoint } = req.body;

        if (!hotelId || !endpoint) {
            return res.status(400).json({ error: 'hotelId and endpoint are required' });
        }

        await Subscription.deleteOne({ hotelId, 'subscription.endpoint': endpoint });

        res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

module.exports = router;
