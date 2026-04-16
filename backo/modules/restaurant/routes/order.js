const express = require("express");
const router = express.Router();
const Order = require("../models/order");

// Create Order
router.post("/", async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Orders
router.get("/", async (req, res) => {
    const orders = await Order.find();
    res.json(orders);
});

module.exports = router;