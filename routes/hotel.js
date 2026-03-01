const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Hotel = require('../models/Hotel');

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

module.exports = router;
