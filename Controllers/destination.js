const Destination = require('../Models/destinationModel.js');
const lstData = require('../Models/lstingModel.js');
const Experience = require('../Models/experienceModel.js');

const DEST_PER_PAGE = 12;

// Helper: enrich destinations with stay/experience counts and synced images
async function enrichDestinations(destinations) {
    return Promise.all(
        destinations.map(async (dest) => {
            const stayCount = await lstData.countDocuments({ destination: dest._id });
            const expCount  = await Experience.countDocuments({ destination: dest._id });

            let destObj = dest.toObject ? dest.toObject() : dest;
            const allStays = await lstData.find({ destination: dest._id }).select('image').lean();

            if (allStays.length > 0) {
                const currentDestImg = (destObj.images && destObj.images.length > 0) ? destObj.images[0].url : null;
                const stayHasThisImg = currentDestImg && allStays.some(s => s.image && s.image.url === currentDestImg);
                if (!stayHasThisImg) {
                    const validStay = allStays.find(s => s.image && s.image.url);
                    if (validStay) {
                        if (dest.save) { dest.images = [{ url: validStay.image.url, filename: validStay.image.filename }]; await dest.save(); }
                        destObj.images = [{ url: validStay.image.url, filename: validStay.image.filename }];
                    }
                }
            } else {
                if (destObj.images && destObj.images.length > 0) {
                    if (dest.save) { dest.images = []; await dest.save(); }
                    destObj.images = [];
                }
            }

            return { ...destObj, stayCount, expCount };
        })
    );
}

// GET /destinations — with SEARCH support
module.exports.index = async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : '';
    let filter = {};
    if (searchQuery) {
        const regex = new RegExp(searchQuery, 'i');
        filter = { $or: [{ name: regex }, { country: regex }, { description: regex }] };
    }

    const allDestinations = await Destination.find(filter).sort({ name: 1 });
    const enriched = await enrichDestinations(allDestinations);
    const visible = enriched.filter(d => d.stayCount > 0);

    const totalDestinations = visible.length;
    const paged = visible.slice(0, DEST_PER_PAGE);

    res.locals.searchQuery = searchQuery;
    res.render('destinations.ejs', { destinations: paged, searchQuery, totalDestinations, perPage: DEST_PER_PAGE });
};

// API: Paginate destinations
module.exports.paginateDestinations = async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : '';
    let filter = {};
    if (searchQuery) {
        const regex = new RegExp(searchQuery, 'i');
        filter = { $or: [{ name: regex }, { country: regex }, { description: regex }] };
    }

    const allDestinations = await Destination.find(filter).sort({ name: 1 });
    const enriched = await enrichDestinations(allDestinations);
    const visible = enriched.filter(d => d.stayCount > 0);

    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * DEST_PER_PAGE;
    const total = visible.length;
    const items = visible.slice(skip, skip + DEST_PER_PAGE);
    res.json({ items, total, page, perPage: DEST_PER_PAGE, hasMore: skip + items.length < total });
};

// Items per page for pagination
const PER_PAGE = 6;

// GET /destinations/:id
module.exports.show = async (req, res) => {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
        req.flash('error', 'Destination not found!');
        return res.redirect('/destinations');
    }

    const totalStays = await lstData.countDocuments({ destination: destination._id });
    const totalExperiences = await Experience.countDocuments({ destination: destination._id });

    const stays = await lstData.find({ destination: destination._id })
        .populate('owner')
        .limit(PER_PAGE);
    const experiences = await Experience.find({ destination: destination._id })
        .limit(PER_PAGE);

    res.render('destination_detail.ejs', {
        destination, stays, experiences,
        totalStays, totalExperiences,
        perPage: PER_PAGE
    });
};

// GET /destinations/:id/api?type=stays|experiences&page=2
module.exports.paginate = async (req, res) => {
    const destination = await Destination.findById(req.params.id);
    if (!destination) return res.status(404).json({ error: 'Not found' });

    const type = req.query.type || 'stays';
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * PER_PAGE;

    if (type === 'experiences') {
        const total = await Experience.countDocuments({ destination: destination._id });
        const items = await Experience.find({ destination: destination._id })
            .skip(skip).limit(PER_PAGE).lean();
        return res.json({ items, total, page, perPage: PER_PAGE, hasMore: skip + items.length < total });
    }

    // Default: stays
    const total = await lstData.countDocuments({ destination: destination._id });
    const items = await lstData.find({ destination: destination._id })
        .populate('owner').skip(skip).limit(PER_PAGE).lean();
    return res.json({ items, total, page, perPage: PER_PAGE, hasMore: skip + items.length < total });
};
