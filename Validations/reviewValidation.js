const Joi = require('joi');

const schema = Joi.object({
    comment: Joi.string().required(),
    rating: Joi.number().required().min(1).max(5),
}).required()
module.exports = schema;
