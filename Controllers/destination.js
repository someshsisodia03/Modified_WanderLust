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
            return { ...dest.toObject(), stayCount, expCount };
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
