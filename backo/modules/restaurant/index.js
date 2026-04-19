const express = require("express");
const router = express.Router();

const ordersRoutes = require("./routes/order");
const billsRoutes = require("./routes/bills");
const kotRoutes = require("./routes/kot");


router.use("/order", ordersRoutes);
router.use("/bills", billsRoutes);
router.use("/kot", kotRoutes);


module.exports = router;