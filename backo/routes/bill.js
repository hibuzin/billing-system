const express = require("express");
const router = express.Router();
const Bill = require("../models/bill");
const Product = require("../models/product");
const auth = require("../middleware/auth");



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

        // ✅ decrease stock FIRST (safe)
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: product._id, stock: { $gt: 0 } },
            { $inc: { stock: -1 } },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(400).json({ message: "Stock update failed" });
        }

        // ✅ update bill
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

        // ✅ correct total calculation
        bill.totalAmount = bill.items.reduce(
            (sum, item) => sum + item.price * item.qty,
            0
        );

        await bill.save();

        // ✅ socket
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

        // ✅ format receipt
        const receipt = {
            shopName: "AR traters",
            date: new Date().toLocaleString(),
            billId: bill._id,

            items: bill.items.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                total: item.qty * item.price
            })),

            totalAmount: bill.totalAmount,
            paymentMethod: bill.paymentMethod || "CASH",
            status: bill.status
        };

        res.json({
            success: true,
            receipt
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/add-product", async (req, res) => {
    try {
        const { billId, imageName } = req.body;

        if (!billId || !imageName) {
            return res.status(400).json({
                message: "billId and imageName required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });

        if (bill.status !== "OPEN") {
            return res.status(400).json({ message: "Bill closed" });
        }

        // 🔍 find product by image
        const product = await Product.findOne({ image: imageName });

        if (!product) {
            return res.status(404).json({
                message: "Product not found for this image"
            });
        }

        if (product.stock <= 0) {
            return res.status(400).json({ message: "Out of stock" });
        }

        // ➕ add item
        const existing = bill.items.find(i =>
            i.productId.equals(product._id)
        );

        if (existing) {
            existing.qty += 1;
        } else {
            bill.items.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                qty: 1
            });
        }

        bill.totalAmount += product.price;

        // 📉 reduce stock
        const updatedProduct = await Product.findByIdAndUpdate(
            product._id,
            { $inc: { stock: -1 } },
            { new: true }
        );

        await bill.save();

        // ⚡ socket
        const io = req.app.get("io");

        io.emit("billUpdated", bill);
        io.emit("stockUpdated", {
            productId: product._id,
            stock: updatedProduct.stock
        });

        res.json({
            success: true,
            message: "Product added by image",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;