const express = require("express");
const router = express.Router();

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/product");
const billRoutes = require("./routes/bill");

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/bills", billRoutes);

module.exports = router;