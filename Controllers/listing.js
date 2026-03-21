let lstData = require("../Models/lstingModel.js")
let review = require("../Models/reviewModel.js");
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
    let { title, description, category, price, country, location } = req.body;
    const newplace = new lstData({
        title: title,
        description: description,
        image: {
            filename: req.file.filename,
            url: req.file.path
        },
        price: price,
        location: location,
        country: country,
        category: category
    });
    newplace.owner = req.user._id;
    await newplace.save();
    req.flash("success", "New Listing has been added!");
    res.redirect("/listing");
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
        await review.deleteMany({ _id: { $in: ids } });
        await lstData.findByIdAndDelete(id);
        req.flash("delete", "Listing has been deleted!")
        res.redirect("/listing");
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
    res.render("particular_detail.ejs", { details });
}