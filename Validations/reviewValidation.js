const Joi = require('joi');

const schema = Joi.object({
    comment: Joi.string().required(),
}).required()
module.exports = schema;
