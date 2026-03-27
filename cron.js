const cron = require('node-cron');
const Menu = require('./models/Menu');
const ImageKit = require('imagekit');
const Hotel = require('./models/Hotel');

// Initialize ImageKit
let imagekit = null;
try {
    imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'fake_public',
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'fake_private',
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/fake_endpoint'
    });
} catch (e) {
    console.log("Cron Imagekit Initialization warning", e);
}

const scheduleCronJobs = () => {
    // Run every day at midnight (Server time)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily cleanup cron job...');
        try {
            // Find menus older than 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const nonDynamicHotels = await Hotel.find({ hotelType: { $in: ['fixed', 'fastfood'] } }).select('_id');
            const nonDynamicHotelIds = nonDynamicHotels.map(h => h._id);

            const oldMenus = await Menu.find({
                date: { $lt: sevenDaysAgo },
                hotelId: { $nin: nonDynamicHotelIds }
            });
            console.log(`Found ${oldMenus.length} old menus to clean up.`);

            for (const menu of oldMenus) {
                try {
                    // If we have an exact file ID tracked (new uploads)
                    if (menu.imagekitFileId && imagekit) {
                        await imagekit.deleteFile(menu.imagekitFileId);
                        console.log(`Deleted specific imagekit file: ${menu.imagekitFileId}`);
                    }
                    // Fallback for old tracked uploads without fileId
                    else if (menu.imageUrl && menu.imageUrl.includes('imagekit.io') && imagekit) {
                        try {
                            const urlParts = menu.imageUrl.split('/');
                            const fileName = urlParts[urlParts.length - 1].split('?')[0]; // strip query params

                            // Find file in ImageKit by name
                            const files = await imagekit.listFiles({
                                searchQuery: `name="${fileName}"`
                            });

                            if (files && files.length > 0) {
                                await imagekit.deleteFile(files[0].fileId);
                                console.log(`Deleted searched imagekit file: ${files[0].fileId} (${fileName})`);
                            }
                        } catch (err) {
                            console.log('Could not find/delete old ImageKit image via search. Ignoring.', err.message);
                        }
                    }

                    // Delete the menu from the database
                    await Menu.findByIdAndDelete(menu._id);
                    console.log(`Deleted old menu record from DB: ${menu._id}`);
                } catch (innerError) {
                    console.error(`Error processing menu ID ${menu._id} for cleanup:`, innerError);
                }
            }
            console.log('Daily cleanup cron job finished.');
        } catch (error) {
            console.error('Error in daily cleanup cron job:', error);
        }
    });
};

module.exports = scheduleCronJobs;
