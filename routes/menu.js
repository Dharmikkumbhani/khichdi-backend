const express = require('express');
const router = express.Router();
const multer = require('multer');
const ImageKit = require('imagekit');
const auth = require('../middleware/auth');
const Menu = require('../models/Menu');
const Subscription = require('../models/Subscription');
const Hotel = require('../models/Hotel');
const webpush = require('web-push');

// Configure web-push with VAPID keys if not already (it's globally configured, but safe to set again or rely on pushRoute)
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

async function notifySubscribers(hotelId) {
    try {
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) return;

        const subscriptions = await Subscription.find({ hotelId });
        const payload = JSON.stringify({
            title: 'New Daily Menu Update!',
            body: `${hotel.hotelName || 'Your favorite restaurant'} just updated their daily menu.`,
            url: '/'
        });

        const sendPromises = subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(sub.subscription, payload);
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log('Subscription has expired or is no longer valid: ', err);
                    await Subscription.deleteOne({ _id: sub._id });
                } else {
                    console.error('Failed to send push notification: ', err);
                }
            }
        });

        await Promise.all(sendPromises);
    } catch (error) {
        console.error('Error notifying subscribers: ', error);
    }
}

// Multer configured for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize ImageKit
// Defaulting to empty to prevent crash, check if strings are available during upload instead
let imagekit = null;
try {
    imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'fake_public',
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'fake_private',
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/fake_endpoint'
    });
} catch (e) {
    console.log("Imagekit Initialization warning", e);
}

// @route   POST /api/menu/upload
// @desc    Upload daily menu photo
router.post('/upload', auth, upload.single('menuImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        // Check if menu for today already exists
        let existingMenu = null;
        const latestMenu = await Menu.findOne({ hotelId: req.user.hotelId }).sort({ date: -1 });

        if (latestMenu) {
            const today = new Date();
            const menuDate = new Date(latestMenu.date);

            // Check if they are the exact same local day
            if (menuDate.getDate() === today.getDate() &&
                menuDate.getMonth() === today.getMonth() &&
                menuDate.getFullYear() === today.getFullYear()) {
                existingMenu = latestMenu;
            }
        }

        const note = req.body.note || '';

        // Detect if the keys are placeholders or not provided
        if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
            console.log('[MOCK IMAGEKIT UPLOAD] ImageKit credentials missing. Faking successful upload.');
            const b64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');

            if (existingMenu) {
                existingMenu.imageUrl = b64;
                existingMenu.note = note;
                await existingMenu.save();
                notifySubscribers(req.user.hotelId);
                return res.status(200).json({ success: true, message: 'Menu updated locally (MOCK mode)', menu: existingMenu });
            } else {
                const newMenu = new Menu({
                    hotelId: req.user.hotelId,
                    imageUrl: b64,
                    note: note
                });
                await newMenu.save();
                notifySubscribers(req.user.hotelId);
                return res.status(200).json({ success: true, message: 'Menu uploaded locally (MOCK mode)', menu: newMenu });
            }
        }

        // Upload to ImageKit
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer, // upload the buffer
            fileName: `menu_${req.user.hotelId}_${Date.now()}`,
            folder: '/menus'
        });

        if (existingMenu) {
            existingMenu.imageUrl = uploadResponse.url;
            existingMenu.note = note;
            await existingMenu.save();
            notifySubscribers(req.user.hotelId);
            return res.status(200).json({ success: true, message: 'Menu updated successfully', menu: existingMenu });
        } else {
            const newMenu = new Menu({
                hotelId: req.user.hotelId,
                imageUrl: uploadResponse.url,
                note: note
            });
            await newMenu.save();
            notifySubscribers(req.user.hotelId);
            return res.status(200).json({ success: true, message: 'Menu uploaded successfully', menu: newMenu });
        }
    } catch (error) {
        console.error('Error uploading menu:', error);
        res.status(500).json({ success: false, message: 'Server error during upload', error: error.message });
    }
});

// @route   GET /api/menu/history
// @desc    Get all past menus for the logged in hotel
router.get('/history', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const menus = await Menu.find({ hotelId: req.user.hotelId })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({ success: true, menus, page, limit });
    } catch (error) {
        console.error('Error fetching menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

// @route   GET /api/menu/today
// @desc    Get today's menus from all hotels (PUBLIC - no auth required)
router.get('/today', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const menus = await Menu.find({ date: { $gte: startOfDay } })
            .populate('hotelId', 'hotelName name mobileNumber')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({ success: true, menus, page, limit });
    } catch (error) {
        console.error('Error fetching today menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

// @route   GET /api/menu/latest
// @desc    Get the most recent menu for each hotel (PUBLIC - no auth required)
router.get('/latest', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const menus = await Menu.aggregate([
            { $sort: { date: -1 } },
            {
                $group: {
                    _id: '$hotelId',
                    latestMenu: { $first: '$$ROOT' }
                }
            },
            { $replaceRoot: { newRoot: '$latestMenu' } },
            { $sort: { date: -1 } },
            {
                $lookup: {
                    from: 'hotels',
                    localField: 'hotelId',
                    foreignField: '_id',
                    as: 'hotel'
                }
            },
            { $unwind: '$hotel' },
            { $skip: skip },
            { $limit: limit }
        ]);

        res.status(200).json({ success: true, menus, page, limit });
    } catch (error) {
        console.error('Error fetching latest menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

module.exports = router;
