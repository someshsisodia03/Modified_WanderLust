const express = require('express');
const router = express.Router();
const wrapAsync = require('../wrapAsync.js');
const experienceController = require('../Controllers/experience.js');
const isLogged = require('../middlewares.js');
const Joi = require('joi');
const ExpressError = require('../ExpressError.js');

// Review validation
const reviewValid = (req, res, next) => {
    const schema = Joi.object({
        comment: Joi.string().required(),
        rating: Joi.number().min(1).max(5).required()
    });
    const { error } = schema.validate(req.body);
    if (error) throw new ExpressError(400, error);
    next();
};

// GET /experiences (login required)
router.get('/experiences', isLogged, wrapAsync(experienceController.index));

// API: Paginate experiences
router.get('/experiences/api/paginate', isLogged, wrapAsync(experienceController.paginateExperiences));

// GET /experiences/filter/:category (login required)
router.get('/experiences/filter/:category', isLogged, wrapAsync(experienceController.filterExperiences));

// GET /experiences/:id (login required)
router.get('/experiences/:id', isLogged, wrapAsync(experienceController.show));

// POST /experiences/:id/review — Add review (login required)
router.post('/experiences/:id/review', isLogged, reviewValid, wrapAsync(experienceController.addReview));

// POST /experiences/:id/review/:reviewId/delete — Delete review (login required)
router.post('/experiences/:id/review/:reviewId/delete', isLogged, wrapAsync(experienceController.deleteReview));

// DELETE /experiences/:id — Delete experience (login required)
router.delete('/experiences/:id', isLogged, wrapAsync(experienceController.destroy));

module.exports = router;
