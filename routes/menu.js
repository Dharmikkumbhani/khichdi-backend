const express = require('express');
const router = express.Router();
const multer = require('multer');
const ImageKit = require('imagekit');
const auth = require('../middleware/auth');
const Menu = require('../models/Menu');

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

        // Detect if the keys are placeholders or not provided
        if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
            // For testing purposes when ImageKit is not fully configured, fake an URL so user can still see frontend logic work.
            console.log('[MOCK IMAGEKIT UPLOAD] ImageKit credentials missing. Faking successful upload.');

            // Base64 encode the image to send back for mock view purposes, so the UI actually shows what they picked
            const b64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
            const newMenu = new Menu({
                hotelId: req.user.hotelId,
                imageUrl: b64, // storing base64 inline temporarily as mock
                note: req.body.note || ''
            });
            await newMenu.save();
            return res.status(200).json({ success: true, message: 'Menu uploaded locally (MOCK mode)', menu: newMenu });
        }

        // Upload to ImageKit
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer, // upload the buffer
            fileName: `menu_${req.user.hotelId}_${Date.now()}`,
            folder: '/menus'
        });

        // Save menu record
        const newMenu = new Menu({
            hotelId: req.user.hotelId,
            imageUrl: uploadResponse.url,
            note: req.body.note || ''
        });
        await newMenu.save();

        res.status(200).json({ success: true, message: 'Menu uploaded successfully', menu: newMenu });
    } catch (error) {
        console.error('Error uploading menu:', error);
        res.status(500).json({ success: false, message: 'Server error during upload', error: error.message });
    }
});

// @route   GET /api/menu/history
// @desc    Get all past menus for the logged in hotel
router.get('/history', auth, async (req, res) => {
    try {
        const menus = await Menu.find({ hotelId: req.user.hotelId }).sort({ date: -1 });
        res.status(200).json({ success: true, menus });
    } catch (error) {
        console.error('Error fetching menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

// @route   GET /api/menu/today
// @desc    Get today's menus from all hotels (PUBLIC - no auth required)
router.get('/today', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const menus = await Menu.find({ date: { $gte: startOfDay } })
            .populate('hotelId', 'hotelName name mobileNumber')
            .sort({ date: -1 });

        res.status(200).json({ success: true, menus });
    } catch (error) {
        console.error('Error fetching today menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

// @route   GET /api/menu/latest
// @desc    Get the most recent menu for each hotel (PUBLIC - no auth required)
router.get('/latest', async (req, res) => {
    try {
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
            { $unwind: '$hotel' }
        ]);

        res.status(200).json({ success: true, menus });
    } catch (error) {
        console.error('Error fetching latest menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

module.exports = router;
