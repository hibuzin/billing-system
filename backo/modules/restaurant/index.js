const express = require("express");
const router = express.Router();

const ordersRoutes = require("./routes/order");
const billsRoutes = require("./routes/bills");


router.use("/order", ordersRoutes);
router.use("/bills", billsRoutes);

module.exports = router;