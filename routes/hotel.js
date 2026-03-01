const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Hotel = require('../models/Hotel');
const multer = require('multer');
const ImageKit = require('imagekit');

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

// @route   GET /api/hotel/dashboard
// @desc    Get hotel user profile/dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
    try {
        const hotel = await Hotel.findById(req.user.hotelId).select('-__v');
        if (!hotel) {
            return res.status(404).json({ msg: 'Hotel not found' });
        }
        res.json({ success: true, hotel });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/hotel/profile
// @desc    Update hotel profile data
// @access  Private
router.put('/profile', auth, async (req, res) => {
    try {
        const { hotelName, price, description, address, latitude, longitude } = req.body;

        let hotel = await Hotel.findById(req.user.hotelId);
        if (!hotel) {
            return res.status(404).json({ msg: 'Hotel not found' });
        }

        if (hotelName !== undefined) hotel.hotelName = hotelName;
        if (price !== undefined) hotel.price = price;
        if (description !== undefined) hotel.description = description;
        if (address !== undefined) hotel.address = address;
        if (latitude !== undefined) hotel.latitude = latitude;
        if (longitude !== undefined) hotel.longitude = longitude;

        await hotel.save();

        res.json({ success: true, hotel, message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/hotel/upload-photos
// @desc    Upload multiple hotel photos
// @access  Private
router.post('/upload-photos', auth, upload.array('hotelImages', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No images provided' });
        }

        let hotel = await Hotel.findById(req.user.hotelId);
        if (!hotel) {
            return res.status(404).json({ msg: 'Hotel not found' });
        }

        let uploadedUrls = [];

        if (!process.env.IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY === 'your_imagekit_public_key' || !imagekit) {
            console.log('[MOCK IMAGEKIT UPLOAD] Faking successful multiple profile upload.');
            uploadedUrls = req.files.map(f => 'data:' + f.mimetype + ';base64,' + f.buffer.toString('base64'));
        } else {
            const uploadPromises = req.files.map(f => {
                return imagekit.upload({
                    file: f.buffer,
                    fileName: `hotel_${req.user.hotelId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    folder: '/hotels'
                });
            });
            const results = await Promise.all(uploadPromises);
            uploadedUrls = results.map(r => r.url);
        }

        if (!hotel.photos) hotel.photos = [];
        hotel.photos.push(...uploadedUrls);

        if (!hotel.imageUrl && hotel.photos.length > 0) {
            hotel.imageUrl = hotel.photos[0];
        }

        await hotel.save();

        res.status(200).json({ success: true, message: 'Images uploaded successfully', photos: hotel.photos, imageUrl: hotel.imageUrl });
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ success: false, message: 'Server error during upload', error: error.message });
    }
});

// @route   DELETE /api/hotel/photo
// @desc    Delete a hotel photo
// @access  Private
router.delete('/photo', auth, async (req, res) => {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) return res.status(400).json({ success: false, message: 'Photo URL is required' });

        let hotel = await Hotel.findById(req.user.hotelId);
        if (!hotel) return res.status(404).json({ msg: 'Hotel not found' });

        hotel.photos = hotel.photos.filter(p => p !== photoUrl);

        if (hotel.imageUrl === photoUrl) {
            hotel.imageUrl = hotel.photos.length > 0 ? hotel.photos[0] : "";
        }

        await hotel.save();
        res.status(200).json({ success: true, message: 'Photo deleted successfully', photos: hotel.photos, imageUrl: hotel.imageUrl });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ success: false, message: 'Server error during deletion', error: error.message });
    }
});

module.exports = router;
