const express = require("express");
const router = express.Router();
const Bill = require("../models/bill");
const Product = require("../models/product");

router.post("/", async (req, res) => {
    try {
        const bill = new Bill({
            items: [],
            total: 0,
            status: "active"
        });

        await bill.save();

        res.status(201).json({
            success: true,
            message: "Bill created",
            bill
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


router.post("/scan", async (req, res) => {
    try {
        const { billId, barcode } = req.body;

        // ✅ validation
        if (!billId || !barcode) {
            return res.status(400).json({
                message: "billId and barcode required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        // ✅ FIX: check BEFORE processing
        if (bill.status !== "active") {
            return res.status(400).json({
                message: "Bill already completed"
            });
        }

        const product = await Product.findOne({ barcode });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const existingItem = bill.items.find(
            item => item.productId.toString() === product._id.toString()
        );

        if (existingItem) {
            existingItem.qty += 1;
        } else {
            bill.items.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                qty: 1
            });
        }

        // ✅ total
        bill.total = bill.items.reduce((sum, item) => {
            return sum + item.price * item.qty;
        }, 0);

        await bill.save();

        res.json({
            success: true,
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;