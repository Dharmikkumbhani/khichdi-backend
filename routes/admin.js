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
        // Fetch only public fields required by the UI map frontend
        const hotels = await Hotel.find()
            .select('_id name hotelName price address latitude longitude photos imageUrl hotelType')
            .lean()
            .sort({ createdAt: -1 });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayMenus = await Menu.find({ date: { $gte: startOfDay } })
            .select('hotelId imageUrl date note')
            .lean();

        const fixedHotelIds = hotels.filter(h => h.hotelType === 'fixed').map(h => h._id);
        const fixedMenus = await Menu.aggregate([
            { $match: { hotelId: { $in: fixedHotelIds } } },
            { $sort: { date: -1 } },
            {
                $group: {
                    _id: '$hotelId',
                    latestMenu: { $first: '$$ROOT' }
                }
            },
            { $replaceRoot: { newRoot: '$latestMenu' } }
        ]);

        const menuMap = {};
        todayMenus.forEach(m => { menuMap[m.hotelId.toString()] = m; });
        fixedMenus.forEach(m => { menuMap[m.hotelId.toString()] = m; });

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
        const { mobileNumber, password, name, hotelName, price, description, address, latitude, longitude, hotelType } = req.body;

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
            address: address || "",
            latitude: latitude || null,
            longitude: longitude || null,
            hotelType: hotelType || "dynamic",
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
        const hotel = await Hotel.findById(req.params.id)
            .select('-password -__v')
            .lean();
        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        const limit = hotel.hotelType === 'fixed' ? 50 : 10;
        const recentMenus = await Menu.find({ hotelId: req.params.id })
            .select('imageUrl date note')
            .sort({ date: -1 })
            .limit(limit)
            .lean();

        res.json({ success: true, hotel, recentMenus });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Update specific hotel
router.put('/hotel/:id', async (req, res) => {
    try {
        const { hotelName, price, description, address, mobileNumber, hotelType } = req.body;
        let hotel = await Hotel.findById(req.params.id);

        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        if (hotelName !== undefined) hotel.hotelName = hotelName;
        if (price !== undefined) hotel.price = price;
        if (description !== undefined) hotel.description = description;
        if (address !== undefined) hotel.address = address;
        if (mobileNumber !== undefined) hotel.mobileNumber = mobileNumber;
        if (hotelType !== undefined) hotel.hotelType = hotelType;

        await hotel.save();
        res.json({ success: true, hotel });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Upload menu for specific hotel without needing their auth
router.post('/hotel/:id/menu', upload.array('menuImages', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        const note = req.body.note || '';
        const hotel = await Hotel.findById(req.params.id);
        if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });

        const isFixed = hotel.hotelType === 'fixed';

        // Check if menu for today already exists
        let existingMenu = null;
        if (!isFixed) {
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
        }

        let uploadedMenus = [];

        // Mock upload or real imagekit upload
        if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const b64 = 'data:' + file.mimetype + ';base64,' + file.buffer.toString('base64');
                if (!isFixed && existingMenu && i === 0) {
                    existingMenu.imageUrl = b64;
                    existingMenu.note = note;
                    await existingMenu.save();
                    uploadedMenus.push(existingMenu);
                } else {
                    const newMenu = new Menu({ hotelId: req.params.id, imageUrl: b64, note });
                    await newMenu.save();
                    uploadedMenus.push(newMenu);
                }
            }
            return res.status(200).json({ success: true, menu: uploadedMenus[0] });
        }

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const uploadResponse = await imagekit.upload({
                file: file.buffer,
                fileName: `admin_menu_${req.params.id}_${Date.now()}_${i}`,
                folder: '/menus'
            });

            if (!isFixed && existingMenu && i === 0) {
                existingMenu.imageUrl = uploadResponse.url;
                existingMenu.note = note;
                await existingMenu.save();
                uploadedMenus.push(existingMenu);
            } else {
                const newMenu = new Menu({ hotelId: req.params.id, imageUrl: uploadResponse.url, note });
                await newMenu.save();
                uploadedMenus.push(newMenu);
            }
        }
        return res.status(200).json({ success: true, menu: uploadedMenus[0] });
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
