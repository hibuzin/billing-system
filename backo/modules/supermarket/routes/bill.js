const express = require("express");
const router = express.Router();
const Bill = require("../models/bill");
const Product = require("../models/product");
const auth = require("../../../middleware/auth"); 
const mongoose = require("mongoose");
const translate = require("@vitalets/google-translate-api");

router.post("/start", auth, async (req, res) => {
    try {
        const bill = new Bill({
            items: [],
            totalAmount: 0,
            status: "OPEN"
        });

        await bill.save();

        res.json({
            success: true,
            message: "Bill started",
            billId: bill._id
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



router.post("/scan", auth, async (req, res) => {
    try {
        const { billId, barcode } = req.body;

        if (!billId || !barcode) {
            return res.status(400).json({
                message: "billId and barcode required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });

        if (bill.status !== "OPEN") {
            return res.status(400).json({ message: "Bill already closed" });
        }

        const product = await Product.findOne({ barcode });
        if (!product) return res.status(404).json({ message: "Product not found" });

        if (product.stock <= 0) {
            return res.status(400).json({ message: "Out of stock" });
        }


        const updatedProduct = await Product.findOneAndUpdate(
            { _id: product._id, stock: { $gt: 0 } },
            { $inc: { stock: -1 } },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(400).json({ message: "Stock update failed" });
        }


        const existingItem = bill.items.find(item =>
            item.productId.equals(product._id)
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

        bill.totalAmount = bill.items.reduce(
            (sum, item) => sum + item.price * item.qty,
            0
        );

        await bill.save();


        const io = req.app.get("io");

        io.emit("stockUpdated", {
            productId: product._id,
            stock: updatedProduct.stock
        });

        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Product scanned",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/scan-multiple", auth, async (req, res) => {
    try {

        const { billId, barcodes } = req.body;

        if (!billId || !Array.isArray(barcodes)) {
            return res.status(400).json({
                message: "billId and barcodes array required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        for (const code of barcodes) {

            const product = await Product.findOneAndUpdate(
                { barcode: code, stock: { $gt: 0 } },
                { $inc: { stock: -1 } },
                { new: true }
            );

            if (!product) continue; // skip if out of stock

            const existingItem = bill.items.find(
                item => item.productId === product._id.toString()
            );

            if (existingItem) {
                existingItem.qty += 1;
            } else {
                bill.items.push({
                    productId: product._id,
                    name: product.name,
                    price: Number(product.price) || 0,
                    qty: 1
                });
            }
        }


        bill.totalAmount = bill.items.reduce(
            (sum, item) => sum + (item.qty || 0) * (item.price || 0),
            0
        );

        await bill.save();

        res.json({
            message: "Bulk scan success",
            bill: {
                ...bill.toObject(),
                total: undefined // remove if exists
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.post("/remove-item", auth, async (req, res) => {
    try {
        const { billId, productId } = req.body;

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });

        const itemIndex = bill.items.findIndex(
            i => i.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({ message: "Item not found" });
        }

        const item = bill.items[itemIndex];

        // restore stock + get updated value
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $inc: { stock: 1 } },
            { new: true }
        );

        const io = req.app.get("io");

        io.emit("stockUpdated", {
            productId,
            stock: updatedProduct.stock
        });

        // update bill
        if (item.qty > 1) {
            item.qty -= 1;
        } else {
            bill.items.splice(itemIndex, 1);
        }

        bill.totalAmount -= item.price;

        await bill.save();

        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Item updated",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



router.post("/close", auth, async (req, res) => {
    try {
        const { billId, paymentMethod } = req.body;

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });

        if (bill.status !== "OPEN") {
            return res.status(400).json({ message: "Bill already closed" });
        }

        bill.status = "CLOSED";
        bill.paymentMethod = paymentMethod || "CASH";
        bill.closedAt = new Date();

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Bill closed",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get("/top-products", auth, async (req, res) => {
    try {
        const min = Number(req.query.min) || 30;

        const result = await Bill.aggregate([
            { $unwind: "$items" },

            {
                $group: {
                    _id: "$items.productId",
                    name: { $first: "$items.name" },
                    image: { $first: "$items.image" },
                    totalSold: { $sum: "$items.qty" }
                }
            },


            {
                $match: {
                    totalSold: { $gte: min }
                }
            },


            { $sort: { totalSold: -1 } }


        ]);

        res.json({
            success: true,
            count: result.length,
            products: result
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get("/low-products", auth, async (req, res) => {
    try {
        const max = Number(req.query.max) || 30;     // user input
        const limit = Number(req.query.limit) || 30; // how many products

        const result = await Product.aggregate([
            {
                $lookup: {
                    from: "bills",
                    let: { productId: { $toString: "$_id" } },
                    pipeline: [
                        { $unwind: "$items" },
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$items.productId", "$$productId"]
                                }
                            }
                        }
                    ],
                    as: "sales"
                }
            },

            {
                $addFields: {
                    totalSold: {
                        $sum: "$sales.items.qty"
                    }
                }
            },


            {
                $match: {
                    $or: [
                        { totalSold: { $lte: max } },
                        { totalSold: { $exists: false } }
                    ]
                }
            },

            { $sort: { totalSold: 1 } },
            { $limit: limit },

            {
                $project: {
                    name: 1,
                    images: 1,
                    stock: 1,
                    totalSold: 1
                }
            }
        ]);

        res.json({ success: true, products: result });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



router.get("/:id", auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);

        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        res.json({
            success: true,
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get("/print/:id", auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);

        if (!bill) {
            return res.status(404).json({
                message: "Bill not found"
            });
        }


        const totalAmount = bill.items.reduce(
            (sum, item) => sum + item.qty * item.price,
            0
        );

        const receipt = {
            shopName: "AR traters",
            date: new Date().toLocaleString(),
            billId: bill._id,

            items: bill.items.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,

            })),

            totalAmount
        };

        res.json({
            success: true,
            receipt
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router; 