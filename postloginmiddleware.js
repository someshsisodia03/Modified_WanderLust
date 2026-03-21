let postlogin = (req,res,next)=>{
    res.locals.redirectUrl = req.session.redirectUrl;
    next();
}
module.exports = postlogin;