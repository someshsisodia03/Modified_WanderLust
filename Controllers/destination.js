const Destination = require('../Models/destinationModel.js');
const lstData = require('../Models/lstingModel.js');
const Experience = require('../Models/experienceModel.js');

// GET /destinations — with SEARCH support
module.exports.index = async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : '';

    let filter = {};
    if (searchQuery) {
        const regex = new RegExp(searchQuery, 'i');
        filter = {
            $or: [
                { name: regex },
                { country: regex },
                { description: regex }
            ]
        };
    }

    const destinations = await Destination.find(filter).sort({ name: 1 });

    const destinationsWithCounts = await Promise.all(
        destinations.map(async (dest) => {
            const stayCount = await lstData.countDocuments({ destination: dest._id });
            const expCount  = await Experience.countDocuments({ destination: dest._id });

            // Always keep the destination image in sync with actual stays
            let destObj = dest.toObject();
            const allStays = await lstData.find({ destination: dest._id }).select('image').lean();

            if (allStays.length > 0) {
                // Check if the current destination image matches any stay's image
                const currentDestImg = (destObj.images && destObj.images.length > 0) ? destObj.images[0].url : null;
                const stayHasThisImg = currentDestImg && allStays.some(s => s.image && s.image.url === currentDestImg);

                if (!stayHasThisImg) {
                    // Current image is stale/missing — pick the first stay's image
                    const validStay = allStays.find(s => s.image && s.image.url);
                    if (validStay) {
                        dest.images = [{ url: validStay.image.url, filename: validStay.image.filename }];
                        await dest.save();
                        destObj.images = dest.images;
                    }
                }
            } else {
                // No stays left — clear images
                if (destObj.images && destObj.images.length > 0) {
                    dest.images = [];
                    await dest.save();
                    destObj.images = [];
                }
            }

            return { ...destObj, stayCount, expCount };
        })
    );

    const visible = destinationsWithCounts.filter(d => d.stayCount > 0);

    res.locals.searchQuery = searchQuery;
    res.render('destinations.ejs', { destinations: visible, searchQuery });
};

// GET /destinations/:id
module.exports.show = async (req, res) => {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
        req.flash('error', 'Destination not found!');
        return res.redirect('/destinations');
    }

    const stays = await lstData.find({ destination: destination._id }).populate('owner');
    const experiences = await Experience.find({ destination: destination._id });

    res.render('destination_detail.ejs', { destination, stays, experiences });
};
