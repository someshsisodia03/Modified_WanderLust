const lstData = require("../Models/lstingModel.js");
const review = require("../Models/reviewModel.js");
const { analyzeSentiment } = require("../utils/sentiment.js");

module.exports.destroy = async (req, res) => {
    let id = req.params.id;
    let revid = req.params.reviewid;
    let revdata = await review.findById(revid).populate("author");
    if (revdata.author._id.equals(req.user._id)) {
        await review.findByIdAndDelete(revid);
        await lstData.findByIdAndUpdate(id, { $pull: { reviews: revid } });
        req.flash("reviewdeleted", "Review has been deleted!");
        res.redirect("/moreabout/" + id);
    } else {
        req.flash("error", "You are not authorised to delete!");
        res.redirect("/moreabout/" + id);
    }
};

module.exports.add = async (req, res) => {
    let id = req.params.id;
    let { comment } = req.body;
    const review1 = new review({
        comment: comment,
        CreatedAt: Date.now()
    });
    review1.author = req.user._id;
    await review1.save();

    const data = await lstData.findById(id);
    data.reviews.push(review1);
    await data.save();

    // ── Run sentiment analysis in the background (non-blocking) ──
    // User gets instant redirect; sentiment fields are patched asynchronously.
    analyzeSentiment(comment)
        .then(async (sentimentResult) => {
            await review.findByIdAndUpdate(review1._id, { sentiment: sentimentResult });
            console.log(`[Sentiment] Review ${review1._id} scored: ${sentimentResult.label} (${sentimentResult.score})`);
        })
        .catch(err => {
            console.error('[Sentiment] Background analysis failed:', err.message);
        });

    req.flash("reviewsuccess", "Review has been added!");
    res.redirect("/moreabout/" + id);
};