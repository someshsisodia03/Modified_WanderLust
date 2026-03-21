let lstData = require("../Models/lstingModel.js")
let review = require("../Models/reviewModel.js")
module.exports.destroy = async (req, res) => {
    let id = req.params.id;
    let revid = req.params.reviewid;
    let revdata = await review.findById(revid).populate("author");
    if (revdata.author._id.equals(req.user._id)) {
        await review.findByIdAndDelete(revid);
        await lstData.findByIdAndUpdate(id, { $pull: { reviews: revid } });
        req.flash("reviewdeleted", "Review has been deleted!");
        res.redirect("/moreabout/" + id);
    }
    else {
        req.flash("error", "You are not authorised to delete!");
        res.redirect("/moreabout/" + id);
    }

}
module.exports.add = async (req, res) => {
    let id = req.params.id;
    let { comment, rating } = req.body;
    const review1 = new review({
        comment: comment,
        rating: rating,
        CreatedAt: Date.now()
    })
    review1.author = req.user._id;
    await review1.save();
    let data = await lstData.findById(id);
    data.reviews.push(review1);
    await data.save();
    req.flash("reviewsuccess", "Review has been added!");
    res.redirect("/moreabout/" + id);
}