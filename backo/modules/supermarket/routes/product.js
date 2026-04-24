const express = require("express");
const router = express.Router();
const Product = require("../models/product");
const Bill = require("../models/bill");

const bwipjs = require("bwip-js");
const { v4: uuidv4 } = require("uuid");
const auth = require("../../../middleware/auth");



router.post("/", auth, async (req, res) => {
    try {
        const { name, price, stock, barcodeCount, gstRate } = req.body;

        if (!name || price == null || stock == null) {
            return res.status(400).json({
                message: "Name, price and stock required"
            });
        }


        const allowedGST = [0, 5, 8, 12, 18];
        const finalGST = gstRate ?? 18;

        if (!allowedGST.includes(finalGST)) {
            return res.status(400).json({
                message: "Invalid GST rate (0, 5, 8, 12, 18 allowed)"
            });
        }

        const count = Number(barcodeCount) || 1;

        if (count <= 0) {
            return res.status(400).json({
                message: "barcodeCount must be greater than 0"
            });
        }

        const barcodes = [];

        for (let i = 0; i < count; i++) {
            barcodes.push(
                Date.now().toString() + Math.floor(Math.random() * 1000) + i
            );
        }

        const product = new Product({
            name,
            price: Number(price),
            stock: Number(stock),
            gstRate: finalGST,
            barcodes
        });

        await product.save();

        res.json({
            success: true,
            totalBarcodes: barcodes.length,
            product
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});



router.get("/", auth, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (err) {
        console.error("Get Products Error:", err);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    }
});

router.get("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            product
        });

    } catch (err) {
        console.error("Get Product Error:", err);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    }
});


// GET product by barcode
router.get("/scan/:barcode", auth, async (req, res) => {
    try {
        const { barcode } = req.params;

        const product = await Product.findOne({
            barcodes: barcode
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.json({
            success: true,
            product
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});



router.put("/:id", auth, async (req, res) => {
    try {
        const { name, price, stock, gstRate, barcodeCount } = req.body;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }


        const allowedGST = [0, 5, 8, 12, 18];
        if (gstRate !== undefined && !allowedGST.includes(Number(gstRate))) {
            return res.status(400).json({
                message: "Invalid GST rate (0, 5, 8, 12, 18 allowed)"
            });
        }


        if (name !== undefined) product.name = name;
        if (price !== undefined) product.price = Number(price);
        if (stock !== undefined) product.stock = Number(stock);
        if (gstRate !== undefined) product.gstRate = Number(gstRate);


        if (barcodeCount !== undefined) {
            const count = Number(barcodeCount);

            if (count <= 0) {
                return res.status(400).json({
                    message: "barcodeCount must be greater than 0"
                });
            }

            const barcodes = [];

            for (let i = 0; i < count; i++) {
                barcodes.push(
                    Date.now().toString() +
                    Math.floor(Math.random() * 1000) +
                    i
                );
            }

            product.barcodes = barcodes;
        }

        await product.save();

        res.json({
            success: true,
            message: "Product updated successfully",
            product
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({
            success: false,
            message: "Update failed",
            error: err.message
        });
    }
});


router.delete("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json({ message: "Product deleted" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/low-stock", async (req, res) => {
    try {
        const io = req.app.get("io");

        const threshold = req.query.limit ? parseInt(req.query.limit) : 5;

        const lowStockProducts = await Product.find({
            stock: { $lte: threshold }
        }).sort({ stock: 1 });

        if (lowStockProducts.length > 0) {
            io.emit("low-stock-alert", lowStockProducts);
        }


        res.json({
            message: `Products with stock <= ${threshold}`,
            count: lowStockProducts.length,
            threshold,
            data: lowStockProducts
        });

    } catch (error) {
        res.status(500).json({
            message: "Error fetching low stock products",
            error: error.message
        });
    }
});


router.get("/barcode/:code", auth, async (req, res) => {
    try {
        const { code } = req.params;

        // 🔍 find product by barcode inside array
        const product = await Product.findOne({
            barcodes: code
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Barcode not found"
            });
        }

        return res.status(200).json({
            success: true,
            product
        });

    } catch (err) {
        console.error("Barcode Search Error:", err);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
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

router.get("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            success: true,
            product
        });

    } catch (err) {
        res.status(500).json({
            message: "Error fetching product",
            error: err.message
        });
    }
});

module.exports = router;