const passport = require("passport");
const user = require("../Models/user")
module.exports.signup=(req,res)=>{
    res.locals.msg = req.flash("error");
    res.render("signup.ejs");
}
module.exports.addsignup=async(req,res)=>{
    try{
        let {username,email,password} = req.body;
        const user1 = new user({
            email:email,
            username:username
        })
        let newregistereduser = await user.register(user1,password);
        req.login(newregistereduser,()=>{
            req.flash("success",`Welcome to WanderLust`);
            res.redirect("/listing");
        })
        
    }catch(err){
        req.flash("error","Already Registered");
        res.redirect("/listing/signup");
    }
}
module.exports.listingloginone=(req,res)=>{
    res.locals.msg = req.flash("error");
    res.render("login.ejs");
}
module.exports.listinglogintwo=
async(req, res) => {        
    let { username } = req.body;
    if(!res.locals.redirectUrl){
        req.flash("success", `Hi ${username}, Welcome back to WanderLust`);
        return res.redirect("/listing");
    }
    res.redirect(res.locals.redirectUrl);
}
module.exports.logout=(req,res)=>{
    req.logout(()=>{
    req.flash("success","You have been successfully logged-out");
    res.locals.redirect=false;
    res.redirect("/listing/login");
    })
}