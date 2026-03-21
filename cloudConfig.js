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
        allowedFormat: ['png','jpeg','jpg'],
        transformation: [
            {
                width: 1600,
                height: 900,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto:best',
                fetch_format: 'auto'
            }
        ]
    },
});

module.exports = { cloudinary, storage }
