const express = require("express");
const router = express.Router();
const Bill = require("../models/bill");
const Product = require("../models/product");
const auth = require("../middleware/auth");
const mongoose = require("mongoose");


function parseVoice(text) {
    const words = text.toLowerCase().split(" ");
    const items = [];

    let nameParts = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const num = Number(word);

        if (!isNaN(num)) {
            const name = nameParts.join(" ");
            if (name) {
                items.push({ name, qty: num });
            }
            nameParts = [];
        } else {
            nameParts.push(word);
        }
    }

    // handle last product (no qty → default 1)
    if (nameParts.length > 0) {
        items.push({ name: nameParts.join(" "), qty: 1 });
    }

    return items;
}


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



router.post("/scan", async (req, res) => {
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


router.post("/scan-multiple", async (req, res) => {
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


router.post("/remove-item", async (req, res) => {
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



router.post("/close", async (req, res) => {
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



router.get("/:id", async (req, res) => {
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

router.get("/print/:id", async (req, res) => {
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


router.post("/add-products", async (req, res) => {
    try {
        const { billId, items } = req.body;

        if (!billId || !Array.isArray(items)) {
            return res.status(400).json({
                message: "billId and items array required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        for (const item of items) {
            let { imageName, qty } = item;

            qty = Number(qty) || 1;

            if (qty <= 0) continue;

            const product = await Product.findOne({
                images: imageName
            });

            if (!product) continue;
            if (product.stock < qty) continue;

            const existing = bill.items.find(i =>
                i.productId.toString() === product._id.toString()
            );

            if (existing) {
                existing.qty += qty;
            } else {
                bill.items.push({
                    productId: product._id.toString(),
                    name: product.name,
                    price: product.price,
                    image: product.images[0],
                    qty: qty
                });
            }


            bill.totalAmount += product.price * qty;

            await Product.findByIdAndUpdate(
                product._id,
                { $inc: { stock: -qty } }
            );
        }

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: " products added ",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/voice-add", async (req, res) => {
    
    try {
        
        const { billId, text } = req.body;

        if (!billId || !text) {
            return res.status(400).json({
                message: "billId and text required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });


        const voiceItems = parseVoice(text);

        for (const vItem of voiceItems) {
            const product = await Product.findOne({
                name: { $regex: vItem.name, $options: "i" }
            });

            if (!product) continue;
            if (product.stock < vItem.qty) continue;

            const existing = bill.items.find(i =>
                i.productId.toString() === product._id.toString()
            );

            if (existing) {
                existing.qty += vItem.qty;

                if (!existing.image && product.images && product.images.length > 0) {
                    existing.image = product.images[0];
                }

            } else {
                bill.items.push({
                    productId: product._id.toString(),
                    name: product.name,
                    price: product.price,
                    image: product.images && product.images.length > 0 ? product.images[0] : null,

                    qty: vItem.qty
                });
            }

            bill.totalAmount += product.price * vItem.qty;

            await Product.findByIdAndUpdate(
                product._id,
                { $inc: { stock: -vItem.qty } }
            );
        }

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Multiple products added via voice",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



router.get("/today/sales", async (req, res) => {
    try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const bills = await Bill.find({
            createdAt: { $gte: start, $lte: end }
        });

        const totalSales = bills.reduce(
            (sum, bill) => sum + bill.totalAmount,
            0
        );

        res.json({
            date: start,
            totalSales,
            totalCustomers: bills.length,
            bills
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get("/sales/week", async (req, res) => {
    try {
        const now = new Date();
        const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
        const lastDay = new Date();

        const sales = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(sales[0] || { totalSales: 0, count: 0 });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get("/sales/month", async (req, res) => {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date();

        const sales = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(sales[0] || { totalSales: 0, count: 0 });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/sales/year", async (req, res) => {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), 0, 1);
        const lastDay = new Date();

        const sales = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(sales[0] || { totalSales: 0, count: 0 });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;