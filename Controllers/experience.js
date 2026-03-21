const Experience = require('../Models/experienceModel.js');
const Review = require('../Models/reviewModel.js');

// GET /experiences — with SEARCH support
module.exports.index = async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : '';

    let filter = {};
    if (searchQuery) {
        const regex = new RegExp(searchQuery, 'i');
        filter = {
            $or: [
                { title: regex },
                { description: regex },
                { category: regex },
                { difficulty: regex }
            ]
        };
    }

    const experiences = await Experience.find(filter)
        .populate('destination')
        .sort({ createdAt: -1 });

    res.locals.searchQuery = searchQuery;
    res.render('experiences.ejs', { experiences, activeCategory: '', searchQuery });
};

// GET /experiences/filter/:category
module.exports.filterExperiences = async (req, res) => {
    const category = req.params.category;
    const allExperiences = await Experience.find({})
        .populate('destination')
        .sort({ createdAt: -1 });
    const experiences = allExperiences.filter(e => e.category === category);
    res.render('experiences.ejs', { experiences, activeCategory: category, searchQuery: '' });
};

// GET /experiences/:id
module.exports.show = async (req, res) => {
    const experience = await Experience.findById(req.params.id)
        .populate('destination')
        .populate('owner')
        .populate({ path: 'reviews', populate: { path: 'author' } });

    if (!experience) {
        req.flash('error', 'Experience not found!');
        return res.redirect('/experiences');
    }

    res.locals.review  = req.flash('reviewsuccess');
    res.locals.reviewe = req.flash('reviewdeleted');
    res.locals.err     = req.flash('error');

    const from = req.query.from || '';
    const destId = req.query.destId || '';
    res.render('experience_detail.ejs', { experience, from, destId });
};

// POST /experiences/:id/review
module.exports.addReview = async (req, res) => {
    const { comment, rating } = req.body;
    const newReview = new Review({
        comment,
        rating: parseInt(rating),
        author: req.user._id
    });
    await newReview.save();
    await Experience.findByIdAndUpdate(req.params.id,
        { $push: { reviews: newReview._id } });
    req.flash('reviewsuccess', 'Review added!');
    res.redirect('/experiences/' + req.params.id);
};

// POST /experiences/:id/review/:reviewId/delete
module.exports.deleteReview = async (req, res) => {
    const { id, reviewId } = req.params;
    const rev = await Review.findById(reviewId).populate('author');
    if (rev && rev.author._id.equals(req.user._id)) {
        await Experience.updateOne({ _id: id }, { $pull: { reviews: reviewId } });
        await Review.findByIdAndDelete(reviewId);
        req.flash('reviewdeleted', 'Review deleted.');
    } else {
        req.flash('error', 'You are not authorised to delete this review.');
    }
    res.redirect('/experiences/' + id);
};

// DELETE /experiences/:id
module.exports.destroy = async (req, res) => {
    const exp = await Experience.findById(req.params.id).populate('owner');
    if (!exp) {
        req.flash('error', 'Experience not found!');
        return res.redirect('/experiences');
    }
    if (!exp.owner || !exp.owner._id.equals(req.user._id)) {
        req.flash('error', 'You are not authorised to delete this experience.');
        return res.redirect('/experiences/' + req.params.id);
    }
    await Review.deleteMany({ _id: { $in: exp.reviews } });
    await Experience.findByIdAndDelete(req.params.id);
    req.flash('delete', 'Experience deleted!');
    const from = req.query.from;
    const destId = req.query.destId;
    if (from === 'destination' && destId) {
        res.redirect('/destinations/' + destId);
    } else {
        res.redirect('/experiences');
    }
};
