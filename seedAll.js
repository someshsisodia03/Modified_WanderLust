// ═══════════════════════════════════════════════════════════════════
// seedAll.js — Seeds Destinations, Stays (Listings) & Experiences
// All three will appear properly in MongoDB Compass
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();
const mongoose = require('mongoose');
const Destination = require('./Models/destinationModel.js');
const lstData = require('./Models/lstingModel.js');
const Experience = require('./Models/experienceModel.js');

// ── DESTINATION DATA ──
const destinationsData = [
    { name: "Malibu", country: "United States", description: "A famous beach city in California known for its beautiful coastline, celebrity homes, and surfing culture." },
    { name: "New York City", country: "United States", description: "The city that never sleeps — iconic skyline, Times Square, Central Park, and world-class dining." },
    { name: "Aspen", country: "United States", description: "A premier ski resort town in Colorado surrounded by the majestic Rocky Mountains." },
    { name: "Florence", country: "Italy", description: "The birthplace of the Renaissance, filled with stunning art, architecture, and Tuscan vineyards." },
    { name: "Portland", country: "United States", description: "A quirky, eco-friendly city in Oregon known for its parks, bridges, and independent culture." },
    { name: "Cancun", country: "Mexico", description: "A tropical paradise on the Caribbean coast with turquoise waters, ancient Mayan ruins, and vibrant nightlife." },
    { name: "Lake Tahoe", country: "United States", description: "A stunning freshwater lake in the Sierra Nevada known for skiing, hiking, and crystal-clear water." },
    { name: "Los Angeles", country: "United States", description: "The City of Angels — home to Hollywood, beaches, and endless sunshine." },
    { name: "Verbier", country: "Switzerland", description: "An exclusive Swiss ski resort in the Alps known for challenging slopes and luxury chalets." },
    { name: "Serengeti National Park", country: "Tanzania", description: "One of Africa's most famous wildlife reserves, home to the Great Migration and the Big Five." },
    { name: "Amsterdam", country: "Netherlands", description: "A city of canals, cycling, and culture — known for its museums, tulips, and historic canal houses." },
    { name: "Fiji", country: "Fiji", description: "A South Pacific island paradise with crystal-clear lagoons, coral reefs, and lush tropical forests." },
    { name: "Cotswolds", country: "United Kingdom", description: "Rolling hills, honey-colored stone villages, and quintessentially English countryside." },
    { name: "Boston", country: "United States", description: "A historic city on the East Coast, home to the Freedom Trail, Harvard, and rich American history." },
    { name: "Bali", country: "Indonesia", description: "The Island of the Gods — lush rice terraces, ancient temples, surf beaches, and spiritual retreats." },
    { name: "Banff", country: "Canada", description: "A stunning national park in the Canadian Rockies with turquoise lakes, glaciers, and wildlife." },
    { name: "Miami", country: "United States", description: "A vibrant coastal city known for Art Deco architecture, Latin culture, and South Beach nightlife." },
    { name: "Phuket", country: "Thailand", description: "Thailand's largest island with stunning beaches, vibrant nightlife, and island-hopping adventures." },
    { name: "Scottish Highlands", country: "United Kingdom", description: "Dramatic landscapes of mountains, lochs, and castles — steeped in history and legend." },
    { name: "Dubai", country: "United Arab Emirates", description: "A futuristic city of towering skyscrapers, luxury shopping, desert safaris, and golden beaches." },
    { name: "Montana", country: "United States", description: "Big Sky Country — vast wilderness, ranches, and national parks under endless open skies." },
    { name: "Mykonos", country: "Greece", description: "A glamorous Greek island with whitewashed buildings, golden beaches, and legendary nightlife." },
    { name: "Costa Rica", country: "Costa Rica", description: "A biodiversity hotspot with rainforests, volcanoes, Pacific and Caribbean coastlines." },
    { name: "Charleston", country: "United States", description: "A charming Southern city known for cobblestone streets, historic architecture, and incredible cuisine." },
    { name: "Tokyo", country: "Japan", description: "A megacity blending ultra-modern technology with ancient temples, street food, and pop culture." },
    { name: "New Hampshire", country: "United States", description: "A New England gem with lakes, the White Mountains, fall foliage, and cozy small towns." },
    { name: "Maldives", country: "Maldives", description: "A tropical paradise of overwater villas, white-sand beaches, and vibrant coral reefs in the Indian Ocean." },
];

// ── STAYS (LISTINGS) DATA ──
const staysData = [
    { title: "Cozy Beachfront Cottage", description: "Escape to this charming beachfront cottage for a relaxing getaway. Enjoy stunning ocean views and easy access to the beach.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fHRyYXZlbHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 150000, location: "Malibu", country: "United States", category: "Trending" },
    { title: "Modern Loft in Downtown", description: "Stay in the heart of the city in this stylish loft apartment. Perfect for urban explorers!", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fHRyYXZlbHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 120000, location: "New York City", country: "United States", category: "Mountains" },
    { title: "Mountain Retreat", description: "Unplug and unwind in this peaceful mountain cabin. Surrounded by nature, it's a perfect place to recharge.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8aG90ZWxzfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 100000, location: "Aspen", country: "United States", category: "Rooms" },
    { title: "Historic Villa in Tuscany", description: "Experience the charm of Tuscany in this beautifully restored villa. Explore the rolling hills and vineyards.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8aG90ZWxzfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 250000, location: "Florence", country: "Italy", category: "Rooms" },
    { title: "Secluded Treehouse Getaway", description: "Live among the treetops in this unique treehouse retreat. A true nature lover's paradise.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGhvdGVsc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 80000, location: "Portland", country: "United States", category: "Rooms" },
    { title: "Beachfront Paradise", description: "Step out of your door onto the sandy beach. This beachfront condo offers the ultimate relaxation.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fGhvdGVsc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 200000, location: "Cancun", country: "Mexico", category: "Rooms" },
    { title: "Rustic Cabin by the Lake", description: "Spend your days fishing and kayaking on the serene lake. This cozy cabin is perfect for outdoor enthusiasts.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fG1vdW50YWlufGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 90000, location: "Lake Tahoe", country: "United States", category: "Mountains" },
    { title: "Luxury Penthouse with City Views", description: "Indulge in luxury living with panoramic city views from this stunning penthouse apartment.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1622396481328-9b1b78cdd9fd?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8c2t5JTIwdmFjYXRpb258ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 350000, location: "Los Angeles", country: "United States", category: "Beaches" },
    { title: "Ski-In/Ski-Out Chalet", description: "Hit the slopes right from your doorstep in this ski-in/ski-out chalet in the Swiss Alps.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1502784444187-359ac186c5bb?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHNreSUyMHZhY2F0aW9ufGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 3000000, location: "Verbier", country: "Switzerland", category: "Beaches" },
    { title: "Safari Lodge in the Serengeti", description: "Experience the thrill of the wild in a comfortable safari lodge. Witness the Great Migration up close.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mjl8fG1vdW50YWlufGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 400000, location: "Serengeti National Park", country: "Tanzania", category: "Mountains" },
    { title: "Historic Canal House", description: "Stay in a piece of history in this beautifully preserved canal house in Amsterdam's iconic district.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8Y2FtcGluZ3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 180000, location: "Amsterdam", country: "Netherlands", category: "Camping" },
    { title: "Private Island Retreat", description: "Have an entire island to yourself for a truly exclusive and unforgettable vacation experience.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1618140052121-39fc6db33972?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bG9kZ2V8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 100000, location: "Fiji", country: "Fiji", category: "Rooms" },
    { title: "Charming Cottage in the Cotswolds", description: "Escape to the picturesque Cotswolds in this quaint and charming cottage with a thatched roof.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1602088113235-229c19758e9f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8YmVhY2glMjB2YWNhdGlvbnxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 120000, location: "Cotswolds", country: "United Kingdom", category: "Beaches" },
    { title: "Historic Brownstone in Boston", description: "Step back in time in this elegant historic brownstone located in the heart of Boston.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1533619239233-6280475a633a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fHNreSUyMHZhY2F0aW9ufGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 220000, location: "Boston", country: "United States", category: "Iconic Cities" },
    { title: "Beachfront Bungalow in Bali", description: "Relax on the sandy shores of Bali in this beautiful beachfront bungalow with a private pool.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1602391833977-358a52198938?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MzJ8fGNhbXBpbmd8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 180000, location: "Bali", country: "Indonesia", category: "Camping" },
    { title: "Mountain View Cabin in Banff", description: "Enjoy breathtaking mountain views from this cozy cabin in the Canadian Rockies.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fGxvZGdlfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 150000, location: "Banff", country: "Canada", category: "Camping" },
    { title: "Art Deco Apartment in Miami", description: "Step into the glamour of the 1920s in this stylish Art Deco apartment in South Beach.", image: { filename: "listingimage", url: "https://plus.unsplash.com/premium_photo-1670963964797-942df1804579?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fGxvZGdlfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 160000, location: "Miami", country: "United States", category: "Arctic" },
    { title: "Tropical Villa in Phuket", description: "Escape to a tropical paradise in this luxurious villa with a private infinity pool in Phuket.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1470165301023-58dab8118cc9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fGxvZGdlfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 3000000, location: "Phuket", country: "Thailand", category: "Arctic" },
    { title: "Historic Castle in Scotland", description: "Live like royalty in this historic castle in the Scottish Highlands. Explore the rugged beauty of the area.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1585543805890-6051f7829f98?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fGJlYWNoJTIwdmFjYXRpb258ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 400000, location: "Scottish Highlands", country: "United Kingdom", category: "Beaches" },
    { title: "Desert Oasis in Dubai", description: "Experience luxury in the middle of the desert in this opulent oasis in Dubai with a private pool.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1518684079-3c830dcef090?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8ZHViYWl8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 500000, location: "Dubai", country: "United Arab Emirates", category: "Trending" },
    { title: "Rustic Log Cabin in Montana", description: "Unplug and unwind in this cozy log cabin surrounded by the natural beauty of Montana.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1586375300773-8384e3e4916f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTN8fGxvZGdlfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 110000, location: "Montana", country: "United States", category: "Farms" },
    { title: "Beachfront Villa in Greece", description: "Enjoy the crystal-clear waters of the Mediterranean in this beautiful beachfront villa on a Greek island.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8dmlsbGF8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 250000, location: "Mykonos", country: "Greece", category: "Castles" },
    { title: "Eco-Friendly Treehouse Retreat", description: "Stay in an eco-friendly treehouse nestled in the forest. It's the perfect escape for nature lovers.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1488462237308-ecaa28b729d7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8c2t5JTIwdmFjYXRpb258ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 750000, location: "Costa Rica", country: "Costa Rica", category: "Beaches" },
    { title: "Historic Cottage in Charleston", description: "Experience the charm of historic Charleston in this beautifully restored cottage with a private garden.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1587381420270-3e1a5b9e6904?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGxvZGdlfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 160000, location: "Charleston", country: "United States", category: "Mountains" },
    { title: "Modern Apartment in Tokyo", description: "Explore the vibrant city of Tokyo from this modern and centrally located apartment.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1480796927426-f609979314bd?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fHRva3lvfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60" }, price: 2000000, location: "Tokyo", country: "Japan", category: "Iconic Cities" },
    { title: "Lakefront Cabin in New Hampshire", description: "Spend your days by the lake in this cozy cabin in the scenic White Mountains of New Hampshire.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1578645510447-e20b4311e3ce?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDF8fGNhbXBpbmd8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 1200, location: "New Hampshire", country: "United States", category: "Camping" },
    { title: "Luxury Villa in the Maldives", description: "Indulge in luxury in this overwater villa in the Maldives with stunning views of the Indian Ocean.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bGFrZXxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 6000, location: "Maldives", country: "Maldives", category: "Trending" },
    { title: "Ski Chalet in Aspen", description: "Hit the slopes in style with this luxurious ski chalet in the world-famous Aspen ski resort.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fGxha2V8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60" }, price: 4000, location: "Aspen", country: "United States", category: "Mountains" },
    { title: "Secluded Beach House in Costa Rica", description: "Escape to a secluded beach house on the Pacific coast of Costa Rica. Surf, relax, and unwind.", image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YmVhY2glMjBob3VzZXxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60" }, price: 1800, location: "Costa Rica", country: "Costa Rica", category: "Beaches" },
];

// ── EXPERIENCES DATA ──
const experiencesData = [
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
    { title: "Bali Temple & Rice Terrace Tour", description: "Visit ancient temples and walk through stunning rice terraces.", duration: "Full Day", price: 3500, difficulty: "Moderate", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1537956965359-7573183d1f57?w=800&q=60", filename: "expimage" }], location: "Bali", country: "Indonesia" },
    { title: "Banff Stargazing & Campfire", description: "Spend a magical evening under the stars.", duration: "3 hours", price: 2500, difficulty: "Easy", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=800&q=60", filename: "expimage" }], location: "Banff", country: "Canada" },
    { title: "New Hampshire Lake Fishing", description: "Spend a peaceful morning fishing on the serene lakefront.", duration: "4 hours", price: 1800, difficulty: "Easy", category: "Camping", images: [{ url: "https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=800&q=60", filename: "expimage" }], location: "New Hampshire", country: "United States" },
    { title: "Montana Horse Riding Trail", description: "Ride through the stunning Montana countryside on horseback.", duration: "3 hours", price: 3500, difficulty: "Moderate", category: "Farms", images: [{ url: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&q=60", filename: "expimage" }], location: "Montana", country: "United States" },
    { title: "Swiss Alps Ski Adventure", description: "Hit the pristine slopes of the Swiss Alps with a private instructor.", duration: "Full Day", price: 12000, difficulty: "Challenging", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&q=60", filename: "expimage" }], location: "Verbier", country: "Switzerland" },
    { title: "Miami Art Deco Walking Tour", description: "Discover the glamorous Art Deco architecture of South Beach.", duration: "2.5 hours", price: 1500, difficulty: "Easy", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=800&q=60", filename: "expimage" }], location: "Miami", country: "United States" },
    { title: "Phuket Island Hopping", description: "Explore stunning islands around Phuket by speedboat.", duration: "Full Day", price: 5500, difficulty: "Moderate", category: "Arctic", images: [{ url: "https://images.unsplash.com/photo-1537956965359-7573183d1f57?w=800&q=60", filename: "expimage" }], location: "Phuket", country: "Thailand" },
    { title: "Downtown NYC Walking Tour", description: "Explore the vibrant streets of New York City with a local guide.", duration: "3 hours", price: 2000, difficulty: "Easy", category: "Iconic Cities", images: [{ url: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=60", filename: "expimage" }], location: "New York City", country: "United States" },
    { title: "LA Helicopter City Tour", description: "See Los Angeles from above!", duration: "1 hour", price: 15000, difficulty: "Easy", category: "Beaches", images: [{ url: "https://images.unsplash.com/photo-1444602537814-6c68ce0e3c33?w=800&q=60", filename: "expimage" }], location: "Los Angeles", country: "United States" },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════
async function seedAll() {
    const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2';
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // ─── Step 1: Clear all collections ───
    console.log('🗑️  Clearing old data...');
    await Destination.deleteMany({});
    await lstData.deleteMany({});
    await Experience.deleteMany({});
    console.log('   Cleared: destinations, listings, experiences\n');

    // ─── Step 2: Seed Destinations ───
    console.log('🌍 Seeding Destinations...');
    const destMap = {}; // { "malibu_united states": destObject }

    for (const d of destinationsData) {
        const dest = new Destination({
            name: d.name,
            country: d.country,
            description: d.description,
            images: [] // will be filled from stays/experiences
        });
        await dest.save();
        destMap[`${d.name.toLowerCase()}_${d.country.toLowerCase()}`] = dest;
        console.log(`   ✅ ${d.name}, ${d.country}`);
    }
    console.log(`   → ${Object.keys(destMap).length} destinations created\n`);

    // ─── Step 3: Seed Stays (Listings) ───
    console.log('🏠 Seeding Stays (Listings)...');
    let stayCount = 0;

    for (const stay of staysData) {
        const key = `${stay.location.toLowerCase()}_${stay.country.toLowerCase()}`;
        const dest = destMap[key];

        if (!dest) {
            console.log(`   ⚠️  No destination found for: ${stay.location}, ${stay.country} — skipping`);
            continue;
        }

        // Add image to destination if it doesn't have one yet
        if (dest.images.length === 0 && stay.image && stay.image.url) {
            dest.images.push({ url: stay.image.url, filename: stay.image.filename || 'destimage' });
            await dest.save();
        }

        const listing = new lstData({
            title: stay.title,
            description: stay.description,
            image: stay.image,
            price: stay.price,
            location: stay.location,
            country: stay.country,
            category: stay.category,
            destination: dest._id
        });
        await listing.save();
        stayCount++;
        console.log(`   ✅ ${stay.title} → ${stay.location}`);
    }
    console.log(`   → ${stayCount} stays created\n`);

    // ─── Step 4: Seed Experiences ───
    console.log('🎯 Seeding Experiences...');
    let expCount = 0;

    for (const exp of experiencesData) {
        const key = `${exp.location.toLowerCase()}_${exp.country.toLowerCase()}`;
        const dest = destMap[key];

        if (!dest) {
            console.log(`   ⚠️  No destination found for: ${exp.location}, ${exp.country} — skipping`);
            continue;
        }

        const experience = new Experience({
            title: exp.title,
            description: exp.description,
            duration: exp.duration,
            price: exp.price,
            difficulty: exp.difficulty,
            category: exp.category,
            images: exp.images || [],
            destination: dest._id
        });
        await experience.save();
        expCount++;
        console.log(`   ✅ ${exp.title} → ${exp.location}`);
    }
    console.log(`   → ${expCount} experiences created\n`);

    // ─── Summary ───
    console.log('═══════════════════════════════════════════');
    console.log('  📊 SEED SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`  🌍 Destinations: ${Object.keys(destMap).length}`);
    console.log(`  🏠 Stays:        ${stayCount}`);
    console.log(`  🎯 Experiences:  ${expCount}`);
    console.log('═══════════════════════════════════════════');
    console.log('\n✅ All data seeded! Check MongoDB Compass. 🎉\n');

    await mongoose.connection.close();
    process.exit(0);
}

seedAll().catch(err => {
    console.error('\n❌ Seed error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
