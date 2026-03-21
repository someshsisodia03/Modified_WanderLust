let lstData = require("../Models/lstingModel.js")
let review = require("../Models/reviewModel.js");
const Experience = require("../Models/experienceModel.js");
const Destination = require("../Models/destinationModel.js");
module.exports.showlisting = async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : '';
    let data;

    if (searchQuery) {
        // Case-insensitive search across title, location, country, and category
        const regex = new RegExp(searchQuery, 'i');
        data = await lstData.find({
            $or: [
                { title: regex },
                { location: regex },
                { country: regex },
                { category: regex }
            ]
        }).populate({ path: 'owner' });
    } else {
        data = await lstData.find({}).populate({ path: 'owner' });
    }

    res.locals.err = req.flash('error');
    res.locals.msg = req.flash('success');
    res.locals.msge = req.flash('update');
    res.locals.del = req.flash('delete');
    res.locals.searchQuery = searchQuery;   // so navbar keeps the search text

    res.render('listData.ejs', { listdata: data, searchQuery });
}
module.exports.createlisting = (req, res) => {
    res.render("create.ejs");
}
module.exports.filter = async (req, res) => {
    let data = await lstData.find({}).populate({ path: "owner" });
    let categor = req.params.category;
    res.render("filter.ejs", { listdata: data, catg: categor });
}
module.exports.edit = async (req, res) => {
    let { title, description, category, price, country, location,
          addExperience, expTitle, expDescription, expDuration, expDifficulty, expPrice, expCategory } = req.body;

    // Get the listing image from upload.fields
    const listingFile = req.files['url'] ? req.files['url'][0] : null;

    // Find or create the destination for this location + country
    let destination = await Destination.findOne({
        name: new RegExp(`^${location.trim()}$`, 'i'),
        country: new RegExp(`^${country.trim()}$`, 'i')
    });
    if (!destination) {
        destination = await Destination.create({
            name: location.trim(),
            country: country.trim(),
            images: [{ url: listingFile.path, filename: listingFile.filename }]
        });
    } else if (!destination.images || destination.images.length === 0) {
        // Existing destination has no images — use the listing's image
        destination.images = [{ url: listingFile.path, filename: listingFile.filename }];
        await destination.save();
    }

    const newplace = new lstData({
        title: title,
        description: description,
        image: {
            filename: listingFile.filename,
            url: listingFile.path
        },
        price: price,
        location: location,
        country: country,
        category: category,
        destination: destination._id
    });
    newplace.owner = req.user._id;
    await newplace.save();

    // Optionally create an Experience linked to the same destination
    if (addExperience === 'yes' && expTitle && expTitle.trim()) {
        // Use separate experience image if uploaded, otherwise fall back to listing image
        const expFile = (req.files['expImage'] && req.files['expImage'][0]) ? req.files['expImage'][0] : listingFile;

        const newExp = new Experience({
            title: expTitle.trim(),
            description: expDescription ? expDescription.trim() : '',
            duration: expDuration ? expDuration.trim() : '1 hour',
            price: expPrice ? Number(expPrice) : 0,
            category: expCategory || category,
            difficulty: expDifficulty || 'Easy',
            images: [{
                url: expFile.path,
                filename: expFile.filename
            }],
            destination: destination._id,
            owner: req.user._id
        });
        await newExp.save();
    }

    req.flash("success", "New Listing has been added!");
    res.redirect("/destinations");
}

module.exports.showedit = async (req, res) => {
    let id = req.params.id;
    const oldDetails = await lstData.findById(id).populate({ path: "owner" });
    if (oldDetails.owner._id.equals(req.user._id)) {
        res.locals.fileerr = req.flash("fileName");
        res.render("makechange.ejs", { d: oldDetails });
    }
    else {
        req.flash("error", "You are not authenticated user");
        res.redirect("/moreabout/" + id);
    }
}
module.exports.update = async (req, res) => {
    let { title, description, category, price, country, location } = req.body;
    const updateFields = {
        title: title,
        description: description,
        price: price,
        location: location,
        country: country,
        category: category
    };

    if (req.file) {
        updateFields.image = {
            url: req.file.path,
            filename: req.file.filename
        };
    };
    await lstData.updateOne(
        { _id: req.params.id },
        { $set: updateFields }
    );

    req.flash("update", "Listing has been updated!");
    res.redirect("/listing");

};

module.exports.destroy = async (req, res) => {
    let id = req.params.id;
    let lst = await lstData.findById(id).populate({ path: "owner" });
    if (lst.owner._id.equals(req.user._id)) {
        let ids = lst.reviews;
        const deletedImage = lst.image;
        const destinationId = lst.destination;

        // Delete the listing's reviews
        await review.deleteMany({ _id: { $in: ids } });
        await lstData.findByIdAndDelete(id);

        // Delete corresponding experiences (and their reviews) for this destination by this owner
        if (destinationId) {
            const relatedExps = await Experience.find({
                destination: destinationId,
                owner: req.user._id
            });
            for (const exp of relatedExps) {
                if (exp.reviews && exp.reviews.length > 0) {
                    await review.deleteMany({ _id: { $in: exp.reviews } });
                }
                await Experience.findByIdAndDelete(exp._id);
            }
        }

        // Check how many stays are left for this destination
        let remainingStays = 0;
        if (destinationId) {
            remainingStays = await lstData.countDocuments({ destination: destinationId });

            const dest = await Destination.findById(destinationId);
            if (dest) {
                if (remainingStays > 0) {
                    // Refresh the destination image from remaining stays
                    const wasUsingDeletedImage = dest.images && dest.images.length > 0 &&
                        deletedImage && dest.images[0].url === deletedImage.url;

                    if (wasUsingDeletedImage || !dest.images || dest.images.length === 0) {
                        const anotherStay = await lstData.findOne({ destination: destinationId });
                        if (anotherStay && anotherStay.image && anotherStay.image.url) {
                            dest.images = [{ url: anotherStay.image.url, filename: anotherStay.image.filename }];
                        } else {
                            dest.images = [];
                        }
                        await dest.save();
                    }
                } else {
                    // No stays left — clear the destination images
                    dest.images = [];
                    await dest.save();
                }
            }
        }

        req.flash("delete", "Listing has been deleted!");

        // If no stays left, always redirect to destinations page
        if (remainingStays === 0) {
            res.redirect("/destinations");
        } else {
            const from = req.query.from;
            const destId = req.query.destId;
            if (from === 'destination' && destId) {
                res.redirect("/destinations/" + destId);
            } else {
                res.redirect("/listing");
            }
        }
    }
    else {
        req.flash("error", "You are not authorised to do so");
        res.redirect("/moreabout/" + id);
    }
}

module.exports.final = async (req, res) => {
    let id = req.params.id;
    const details = await lstData.findById(id).populate({
        path: 'reviews',
        populate: { path: 'author' }
    })
        .populate('owner');;
    if (!details) {
        req.flash("error", "Listing Does not exist!");
        return res.redirect("/listing");
    }
    res.locals.review = req.flash("reviewsuccess");
    res.locals.reviewe = req.flash("reviewdeleted");
    res.locals.err = req.flash("error");

    // Geocoding is now done client-side for instant page loads
    const from = req.query.from || '';
    const destId = req.query.destId || '';
    res.render("particular_detail.ejs", { details, from, destId });
}