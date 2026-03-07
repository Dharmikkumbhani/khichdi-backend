const express = require('express');
const router = express.Router();
const multer = require('multer');
const ImageKit = require('imagekit');
const bcrypt = require('bcryptjs');
const Hotel = require('../models/Hotel');
const Menu = require('../models/Menu');
const Subscription = require('../models/Subscription');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

// Get all hotels
router.get('/hotels', async (req, res) => {
    try {
        const hotels = await Hotel.find().lean().sort({ createdAt: -1 });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const menus = await Menu.find({ date: { $gte: startOfDay } }).lean();

        const menuMap = {};
        menus.forEach(m => { menuMap[m.hotelId.toString()] = m; });

        const hotelsWithMenu = hotels.map(h => ({
            ...h,
            todayMenu: menuMap[h._id.toString()] || null
        }));

        res.json({ success: true, hotels: hotelsWithMenu });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Create a new hotel
router.post('/hotel', upload.array('ambiance', 10), async (req, res) => {
    try {
        const { mobileNumber, password, name, hotelName, price, description, latitude, longitude } = req.body;

        if (!mobileNumber || !password) {
            return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
        }

        let existingHotel = await Hotel.findOne({ mobileNumber });
        if (existingHotel) {
            return res.status(400).json({ success: false, message: 'Hotel with this mobile number already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Upload photos if any
        let uploadedUrls = [];
        if (req.files && req.files.length > 0) {
            if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
                uploadedUrls = req.files.map(f => 'data:' + f.mimetype + ';base64,' + f.buffer.toString('base64'));
            } else {
                const uploadPromises = req.files.map(f => {
                    return imagekit.upload({
                        file: f.buffer,
                        fileName: `ambiance_${mobileNumber}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        folder: '/hotels'
                    });
                });
                const results = await Promise.all(uploadPromises);
                uploadedUrls = results.map(r => r.url);
            }
        }

        const newHotel = new Hotel({
            mobileNumber,
            password: hashedPassword,
            name: name || "",
            hotelName: hotelName || "",
            price: price || 0,
            description: description || "",
            latitude: latitude || null,
            longitude: longitude || null,
            photos: uploadedUrls,
            imageUrl: uploadedUrls.length > 0 ? uploadedUrls[0] : "",
            role: 'hotel'
        });

        await newHotel.save();

        res.status(201).json({ success: true, hotel: newHotel });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Get specific hotel
router.get('/hotel/:id', async (req, res) => {
    try {
        const hotel = await Hotel.findById(req.params.id).lean();
        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        const recentMenus = await Menu.find({ hotelId: req.params.id }).sort({ date: -1 }).limit(10).lean();

        res.json({ success: true, hotel, recentMenus });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Update specific hotel
router.put('/hotel/:id', async (req, res) => {
    try {
        const { hotelName, price, description, mobileNumber } = req.body;
        let hotel = await Hotel.findById(req.params.id);

        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        if (hotelName !== undefined) hotel.hotelName = hotelName;
        if (price !== undefined) hotel.price = price;
        if (description !== undefined) hotel.description = description;
        if (mobileNumber !== undefined) hotel.mobileNumber = mobileNumber;

        await hotel.save();
        res.json({ success: true, hotel });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Upload menu for specific hotel without needing their auth
router.post('/hotel/:id/menu', upload.single('menuImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        const note = req.body.note || '';

        // Check if menu for today already exists
        let existingMenu = null;
        const latestMenu = await Menu.findOne({ hotelId: req.params.id }).sort({ date: -1 });

        if (latestMenu) {
            const today = new Date();
            const menuDate = new Date(latestMenu.date);

            if (menuDate.getDate() === today.getDate() &&
                menuDate.getMonth() === today.getMonth() &&
                menuDate.getFullYear() === today.getFullYear()) {
                existingMenu = latestMenu;
            }
        }

        // Mock upload or real imagekit upload
        if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
            const b64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
            if (existingMenu) {
                existingMenu.imageUrl = b64;
                existingMenu.note = note;
                await existingMenu.save();
                return res.status(200).json({ success: true, menu: existingMenu });
            } else {
                const newMenu = new Menu({ hotelId: req.params.id, imageUrl: b64, note });
                await newMenu.save();
                return res.status(200).json({ success: true, menu: newMenu });
            }
        }

        const uploadResponse = await imagekit.upload({
            file: req.file.buffer,
            fileName: `admin_menu_${req.params.id}_${Date.now()}`,
            folder: '/menus'
        });

        if (existingMenu) {
            existingMenu.imageUrl = uploadResponse.url;
            existingMenu.note = note;
            await existingMenu.save();
            return res.status(200).json({ success: true, menu: existingMenu });
        } else {
            const newMenu = new Menu({ hotelId: req.params.id, imageUrl: uploadResponse.url, note });
            await newMenu.save();
            return res.status(200).json({ success: true, menu: newMenu });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Delete specific hotel and all its data
router.delete('/hotel/:id', async (req, res) => {
    try {
        const hotelId = req.params.id;

        // Delete the hotel
        const hotel = await Hotel.findByIdAndDelete(hotelId);
        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        // Delete all menus associated with this hotel
        await Menu.deleteMany({ hotelId: hotelId });

        // Delete all subscriptions associated with this hotel
        await Subscription.deleteMany({ hotelId: hotelId });

        res.json({ success: true, message: 'Hotel and all associated data deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
