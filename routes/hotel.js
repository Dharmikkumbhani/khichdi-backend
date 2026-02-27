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

module.exports = router;
