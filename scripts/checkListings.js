require('dotenv').config();
const mongoose = require('mongoose');
const lstData = require('../Models/lstingModel');
const Experience = require('../Models/experienceModel');

async function check() {
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2');

    const skiChalet  = await lstData.find({ title: { $regex: 'ski chalet', $options: 'i' } }).lean();
    const rusticCabin = await lstData.find({ title: { $regex: 'rustic cabin', $options: 'i' } }).lean();
    const beachHouse = await lstData.find({ title: { $regex: 'secluded beach house', $options: 'i' } }).lean();

    const trekking  = await Experience.find({ title: { $regex: 'mountain peak trekking', $options: 'i' } }).lean();
    const swissAlps = await Experience.find({ title: { $regex: 'swiss alps', $options: 'i' } }).lean();
    const kayaking  = await Experience.find({ title: { $regex: 'kayaking', $options: 'i' } }).lean();

    console.log('=== LISTINGS ===');
    console.log('Ski Chalet (Aspen):',     skiChalet.length  ? skiChalet.map(l  => `${l.title} | ₹${l.price} | ${l.location}`) : ['NOT FOUND']);
    console.log('Rustic Cabin (Lake):',    rusticCabin.length? rusticCabin.map(l => `${l.title} | ₹${l.price} | ${l.location}`) : ['NOT FOUND']);
    console.log('Secluded Beach House:',   beachHouse.length ? beachHouse.map(l  => `${l.title} | ₹${l.price} | ${l.location}`) : ['NOT FOUND']);

    console.log('\n=== EXPERIENCES ===');
    console.log('Mountain Peak Trekking:', trekking.length  ? trekking.map(e  => `${e.title} | ₹${e.price}`) : ['NOT FOUND']);
    console.log('Swiss Alps Ski Adv:',     swissAlps.length ? swissAlps.map(e  => `${e.title} | ₹${e.price}`) : ['NOT FOUND']);
    console.log('Lakeside Kayaking:',      kayaking.length  ? kayaking.map(e   => `${e.title} | ₹${e.price}`) : ['NOT FOUND']);

    await mongoose.disconnect();
}
check().catch(console.error);
