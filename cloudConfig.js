const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
})

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'wanderlust_dev',
        allowedFormats: ['png', 'jpeg', 'jpg', 'webp'],
        // No upload-time transformation — store the original at full quality.
        // Transformations are applied at display time via optimizeImg() helper.
    },
});

module.exports = { cloudinary, storage }
