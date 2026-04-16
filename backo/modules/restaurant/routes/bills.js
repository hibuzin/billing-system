const express = require("express");
const router = express.Router();
const Bill = require("../models/bills");


router.post("/", async (req, res) => {
    try {
        const bill = await Bill.create(req.body);
        res.json(bill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;