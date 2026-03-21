// Seed script — ONLY adds dummy Experiences (does NOT touch existing listings/destinations)
require('dotenv').config();
const mongoose = require('mongoose');
const Destination = require('./Models/destinationModel.js');
const Experience = require('./Models/experienceModel.js');

// ── Dummy Experience Data ──
const dummyExperiences = [
    { title: "Beachfront Sunset Yoga", description: "Start your evening with a soothing yoga session on the beach as the sun melts into the ocean.", duration: "1.5 hours", price: 1500, difficulty: "Easy", category: "Trending", images: [{ url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=60", filename: "expimage" }], location: "Malibu", country: "United States" },
    { title: "Desert Safari & Dune Bashing", description: "Feel the adrenaline pump as you ride across golden sand dunes in a 4x4.", duration: "6 hours", price: 7500, difficulty: "Challenging", category: "Trending", images: [{ url: "https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=800&q=60", filename: "expimage" }], location: "Dubai", country: "United Arab Emirates" },
    { title: "Luxury Overwater Spa", description: "Pamper yourself with a half-day luxury spa experience.", duration: "Half Day", price: 6000, difficulty: "Easy", category: "Trending", images: [{ url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=60", filename: "expimage" }], location: "Maldives", country: "Maldives" },
    { title: "Mountain Cabin Cooking Class", description: "Learn to cook hearty mountain cuisine in a cozy cabin setting.", duration: "3 hours", price: 2500, difficulty: "Easy", category: "Rooms", images: [{ url: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=60", filename: "expimage" }], location: "Aspen", country: "United States" },
    { title: "Historic Villa Wine Evening", description: "Enjoy an exclusive wine tasting evening inside a Tuscan villa.", duration: "2.5 hours", price: 3800, difficulty: "Easy", category: "Rooms", images: [{ url: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=60", filename: "expimage" }], location: "Florence", country: "Italy" },
    { title: "Island Snorkeling Adventure", description: "Explore the vibrant coral reefs around the private island.", duration: "3 hours", price: 3200, difficulty: "Easy", category: "Rooms", images: [{ url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=60", filename: "expimage" }], location: "Fiji", country: "Fiji" },
    { title: "Boston Freedom Trail Walk", description: "Walk the historic 2.5-mile Freedom Trail through downtown Boston.", duration: "3 hours", price: 1800, difficulty: "Easy", category: "Iconic Cities", images: [{ url: "https://images.unsplash.com/photo-1569982175971-d92b01cf8694?w=800&q=60", filename: "expimage" }], location: "Boston", country: "United States" },
    { title: "Tokyo Street Food Walking Tour", description: "Explore hidden culinary gems in the bustling streets of Tokyo.", duration: "3 hours", price: 2200, difficulty: "Easy", category: "Iconic Cities", images: [{ url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=60", filename: "expimage" }], location: "Tokyo", country: "Japan" },
    { title: "Mountain Peak Trekking", description: "Conquer the summit with an exhilarating full-day guided trek.", duration: "Full Day", price: 4500, difficulty: "Challenging", category: "Mountains", images: [{ url: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=60", filename: "expimage" }], location: "Aspen", country: "United States" },
    { title: "Lakeside Kayaking & Fishing", description: "Spend your day kayaking across the serene lake.", duration: "5 hours", price: 3500, difficulty: "Moderate", category: "Mountains", images: [{ url: "https://images.unsplash.com/photo-1472745942893-4b9f730c7668?w=800&q=60", filename: "expimage" }], location: "Lake Tahoe", country: "United States" },
    { title: "Serengeti Sunrise Safari", description: "Witness the Great Migration and spot the Big Five.", duration: "6 hours", price: 8500, difficulty: "Moderate", category: "Mountains", images: [{ url: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=60", filename: "expimage" }], location: "Serengeti National Park", country: "Tanzania" },
    { title: "Greek Island Sailing Tour", description: "Sail around the stunning Mykonos coastline.", duration: "Full Day", price: 6500, difficulty: "Easy", category: "Castles", images: [{ url: "https://images.unsplash.com/photo-1534307671554-9a6d81f4d629?w=800&q=60", filename: "expimage" }], location: "Mykonos", country: "Greece" },
    { title: "Surf Lessons on Cancun Beach", description: "Catch your first wave or improve your surf skills.", duration: "2 hours", price: 3000, difficulty: "Moderate", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1502680390548-bdbac40d7154?w=800&q=60", filename: "expimage" }], location: "Cancun", country: "Mexico" },
    { title: "Cotswolds Countryside Cycling", description: "Pedal through the rolling hills and picturesque villages.", duration: "4 hours", price: 2800, difficulty: "Moderate", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=60", filename: "expimage" }], location: "Cotswolds", country: "United Kingdom" },
    { title: "Scottish Highlands Castle Tour", description: "Walk through centuries of history in a dramatic castle tour.", duration: "3 hours", price: 3200, difficulty: "Easy", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1533154683836-84ea7a0bc310?w=800&q=60", filename: "expimage" }], location: "Scottish Highlands", country: "United Kingdom" },
    { title: "Costa Rica Rainforest Zipline", description: "Soar through the rainforest canopy on an exhilarating zipline adventure.", duration: "3 hours", price: 4000, difficulty: "Challenging", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1534950947221-31a3fe088847?w=800&q=60", filename: "expimage" }], location: "Costa Rica", country: "Costa Rica" },
    { title: "Amsterdam Canal Boat Tour", description: "Cruise through Amsterdam's iconic canals.", duration: "2 hours", price: 2000, difficulty: "Easy", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=60", filename: "expimage" }], location: "Amsterdam", country: "Netherlands" },
    { title: "Bali Temple & Rice Terrace Tour", description: "Visit ancient temples and walk through stunning rice terraces.", duration: "Full Day", price: 3500, difficulty: "Moderate", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=60", filename: "expimage" }], location: "Bali", country: "Indonesia" },
    { title: "Banff Stargazing & Campfire", description: "Spend a magical evening under the stars.", duration: "3 hours", price: 2500, difficulty: "Easy", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=800&q=60", filename: "expimage" }], location: "Banff", country: "Canada" },
    { title: "New Hampshire Lake Fishing", description: "Spend a peaceful morning fishing on the serene lakefront.", duration: "4 hours", price: 1800, difficulty: "Easy", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=800&q=60", filename: "expimage" }], location: "New Hampshire", country: "United States" },
    { title: "Montana Horse Riding Trail", description: "Ride through the stunning Montana countryside on horseback.", duration: "3 hours", price: 3500, difficulty: "Moderate", category: "Farms", images: [{ url: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&q=60", filename: "expimage" }], location: "Montana", country: "United States" },
    { title: "Swiss Alps Ski Adventure", description: "Hit the pristine slopes of the Swiss Alps with a private instructor.", duration: "Full Day", price: 12000, difficulty: "Challenging", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&q=60", filename: "expimage" }], location: "Verbier", country: "Switzerland" },
    { title: "Miami Art Deco Walking Tour", description: "Discover the glamorous Art Deco architecture of South Beach.", duration: "2.5 hours", price: 1500, difficulty: "Easy", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=800&q=60", filename: "expimage" }], location: "Miami", country: "United States" },
    { title: "Phuket Island Hopping", description: "Explore stunning islands around Phuket by speedboat.", duration: "Full Day", price: 5500, difficulty: "Moderate", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1537956965359-7573183d1f57?w=800&q=60", filename: "expimage" }], location: "Phuket", country: "Thailand" },
    { title: "Downtown NYC Walking Tour", description: "Explore the vibrant streets of New York City with a local guide.", duration: "3 hours", price: 2000, difficulty: "Easy", category: "Iconic Cities", images: [{ url: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=60", filename: "expimage" }], location: "New York City", country: "United States" },
    { title: "LA Helicopter City Tour", description: "See Los Angeles from above!", duration: "1 hour", price: 15000, difficulty: "Easy", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1444602537814-6c68ce0e3c33?w=800&q=60", filename: "expimage" }], location: "Los Angeles", country: "United States" }
];

async function seedExperiences() {
    const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('Connected');

    await Experience.deleteMany({});
    console.log('Cleared old experiences');

    let expCount = 0;
    for (const exp of dummyExperiences) {
        const loc = (exp.location || '').trim();
        const country = (exp.country || '').trim();

        let dest = await Destination.findOne({
            name: { $regex: new RegExp(`^${loc}$`, 'i') },
            country: { $regex: new RegExp(`^${country}$`, 'i') }
        });

        if (!dest) {
            dest = new Destination({
                name: loc, country: country,
                description: `Discover the beauty of ${loc}, ${country}.`,
                images: exp.images && exp.images.length > 0
                    ? [{ url: exp.images[0].url, filename: exp.images[0].filename || 'expimage' }] : []
            });
            await dest.save();
            console.log(`  Created destination: ${loc}, ${country}`);
        }

        const newExp = new Experience({
            title: exp.title, description: exp.description, duration: exp.duration,
            price: exp.price, difficulty: exp.difficulty, category: exp.category,
            images: exp.images || [], destination: dest._id
        });
        await newExp.save();
        expCount++;
        console.log(`  Added: ${exp.title} [${exp.category}]`);
    }

    console.log(`\nInserted ${expCount} experiences`);
    await mongoose.connection.close();
    console.log('Done!');
    process.exit(0);
}

seedExperiences().catch(err => { console.error('Seed error:', err.message); process.exit(1); });
