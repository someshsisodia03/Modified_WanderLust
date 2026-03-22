if (process.env.NODE_ENV != "production") {
    require('dotenv').config();
}
const express = require("express");
const app = express();
app.set('trust proxy', 1);
var cookieParser = require('cookie-parser')
app.use(cookieParser("secret"));
const session = require("express-session");
var flash = require('connect-flash');

const engine = require('ejs-mate');
app.engine('ejs', engine);
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));
var methodOverride = require('method-override');
app.use(methodOverride('_method'));
app.use(express.urlencoded({ extended: true }));
const ExpressError = require("./ExpressError.js");
const mongoose = require('mongoose');

// Route imports
let listing = require("./Routes/listing.js")
let reviewe = require("./Routes/review.js");
let signLogin = require("./Routes/usersignupLogin.js")
let destinationRoutes = require("./Routes/destination.js");
let experienceRoutes = require("./Routes/experience.js");
let recommendationRoutes = require("./Routes/recommendation.js");

// MongoDB connection
async function main() {
    const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proj2';
    await mongoose.connect(MONGO_URL);
    console.log('Connected to MongoDB');
}
main().catch((err) => { console.log(err) });

// Passport authentication
const passport = require("passport");
const LocalStrategy = require("passport-local");
const user = require('./Models/user.js');
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'wanderlust-fallback-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }
}))
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

// Global middleware — current user + image optimizer + no-cache
app.use((req, res, next) => {
    res.locals.curruser = req.user;

    // Prevent browser from caching pages (fixes back-button showing deleted items)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // Helper to optimize Cloudinary images on-the-fly (16:9 aspect ratio)
    res.locals.optimizeImg = function(url, width, height) {
        if (!url) return url;
        width = width || 1600;
        height = height || 900;
        if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
            return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill,g_auto,q_auto:best,f_auto/`);
        }
        return url;
    };
    next();
})


// Homepage — stunning landing page
const Destination = require('./Models/destinationModel.js');
const lstData = require('./Models/lstingModel.js');
const Experience = require('./Models/experienceModel.js');

app.get("/", async (req, res) => {
    try {
        const destCount = await Destination.countDocuments();
        const stayCount = await lstData.countDocuments();
        const expCount  = await Experience.countDocuments();
        res.render('home.ejs', { destCount, stayCount, expCount });
    } catch(e) {
        res.render('home.ejs', { destCount: 0, stayCount: 0, expCount: 0 });
    }
});

// Mount routes
app.use("/", listing);
app.use("/", reviewe);
app.use("/", signLogin);
app.use("/", destinationRoutes);
app.use("/", experienceRoutes);
app.use("/", recommendationRoutes);

// 404 handler
app.all("*", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
})

// Error handler
app.use((err, req, res, next) => {
    let { statusCode, message } = err;
    res.render("error.ejs", { message });
})

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
