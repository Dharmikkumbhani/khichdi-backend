const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Hotel = require('../models/Hotel');

// @route   POST /api/auth/direct-login (Reused for password login)
// @desc    Login with password
router.post('/direct-login', async (req, res) => {
    try {
        const { mobileNumber, password } = req.body;

        if (!mobileNumber || !password) {
            return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
        }

        const hotel = await Hotel.findOne({ mobileNumber });
        if (!hotel) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        if (!hotel.password) {
            return res.status(400).json({ success: false, message: 'Password not set for this account. Please contact Admin.' });
        }

        const isMatch = await bcrypt.compare(password, hotel.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate JWT Token
        const payload = {
            hotelId: hotel._id,
            role: hotel.role
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '3650d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token
        });
    } catch (error) {
        console.error('Error in direct login:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
