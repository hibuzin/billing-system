const express = require("express");
const router = express.Router();

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/product");
const billRoutes = require("./routes/bill");


router.use("/auth", authRoutes);
router.use("/product", productRoutes);
router.use("/bill", billRoutes);

module.exports = router;