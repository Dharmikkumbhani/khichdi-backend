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

        // Check if menu for today already exists
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
                return res.status(200).json({ success: true, message: 'Menu updated locally (MOCK mode)', menu: existingMenu });
            } else {
                const newMenu = new Menu({
                    hotelId: req.user.hotelId,
                    imageUrl: b64, // storing base64 inline temporarily as mock
                    note: note
                });
                await newMenu.save();
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
            return res.status(200).json({ success: true, message: 'Menu updated successfully', menu: existingMenu });
        } else {
            // Save menu record
            const newMenu = new Menu({
                hotelId: req.user.hotelId,
                imageUrl: uploadResponse.url,
                note: note
            });
            await newMenu.save();
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
        const menus = await Menu.find({ hotelId: req.user.hotelId }).sort({ date: -1 });
        res.status(200).json({ success: true, menus });
    } catch (error) {
        console.error('Error fetching menus:', error);
        res.status(500).json({ success: false, message: 'Server error fetching menus' });
    }
});

module.exports = router;
