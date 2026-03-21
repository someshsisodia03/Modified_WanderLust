const express = require("express");
const { storage } = require("../cloudConfig.js");
const multer = require('multer')
const upload = multer({ storage })
const router = express.Router({ mergeParams: true });
const listingSchema = require("../Validations/schemaValidation.js")
const wrapAsync = require("../wrapAsync");
const passport = require("passport");
const isLogged = require("../middlewares.js");
const postlogin = require("../postloginmiddleware.js");
const ExpressError = require("../ExpressError.js");
const listingController = require("../Controllers/listing.js")



//Validation Schema....

const valid = (req, res, next) => {
    let result = listingSchema.validate(req.body);
    if (result.error) {
        throw new ExpressError(400, result.error);
    }
    else next();
}

//Show the listings... (login required)
router.get("/listing", isLogged, wrapAsync(listingController.showlisting))

//Filter ke sath Listing (login required)
router.get("/listing/show/:category", isLogged, wrapAsync(listingController.filter));

// Show the form for add the listing...
router.get("/addListingDetail", isLogged, wrapAsync(listingController.createlisting))

//Add the form....
router.post("/addDetail", upload.single("url"), listingController.edit)

// Show the form for update the listing...

router.get("/listing/edit/:id", isLogged, postlogin, wrapAsync(listingController.showedit))

// Update the form
router.patch("/editDetail/:id", upload.single("url"), valid, wrapAsync(listingController.update));

// Delete the listing....
router.delete("/deleteDetail/:id", isLogged, postlogin, wrapAsync(listingController.destroy))

//Particular Listing dikhayega (login required)
router.get("/moreabout/:id", isLogged, wrapAsync(listingController.final));

// Geocoding proxy — browser calls this, server calls Nominatim with proper headers
router.get("/api/geocode", async (req, res) => {
    const q = req.query.q;
    if (!q) return res.json({ error: "No query" });
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
        const geoRes = await fetch(url, {
            headers: {
                'User-Agent': 'WanderLustApp/1.0 (someshsisodia18@gmail.com)',
                'Accept-Language': 'en'
            },
            signal: AbortSignal.timeout(8000)
        });
        const data = await geoRes.json();
        res.json(data);
    } catch (e) {
        res.json([]);
    }
});

module.exports = router;
