const express = require("express");
const router = express.Router();

const Product = require("../models/product");
const upload = require("../../../middleware/upload");
const cloudinary = require("../../../config/cloudinary");
const streamifier = require("streamifier");

const auth = require("../../../middleware/auth");


router.post("/", auth, upload.array("images"), async (req, res) => {
    try {
        const { name, price, stock } = req.body;

        if (!name || price == null || stock == null) {
            return res.status(400).json({
                message: "Name, price and stock required"
            });
        }

        let imageUrls = [];

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const uploadFromBuffer = () => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: "products" },
                            (error, result) => {
                                if (result) resolve(result);
                                else reject(error);
                            }
                        );
                        streamifier.createReadStream(file.buffer).pipe(stream);
                    });
                };

                const result = await uploadFromBuffer();
                imageUrls.push(result.secure_url);
            }
        }

        const product = new Product({
            name,
            price: Number(price),
            stock: Number(stock),
            images: imageUrls,
            userId: req.user.userId
        });

        await product.save();

        res.json({
            success: true,
            product
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


router.get("/search", auth, async (req, res) => {
    try {
        const { q, limit } = req.query;

        if (!q) {
            return res.status(400).json({ message: "Search query required" });
        }

        const products = await Product.find({
            name: { $regex: q, $options: "i" }
        })
            .select("name price stock images")
            .limit(Number(limit) || 10);

        const formatted = products.map(p => ({
            productId: p._id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            image: p.images?.[0] || null
        }));

        res.json({
            success: true,
            products: formatted
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get("/low-stock", async (req, res) => {
    try {
        const io = req.app.get("io");

        const threshold = req.query.limit ? parseInt(req.query.limit) : 5;

        const lowStockProducts = await Product.find({
            stock: { $lte: threshold }
        }).sort({ stock: 1 });

        if (io && lowStockProducts.length > 0) {
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


router.get("/", auth, async (req, res) => {
    try {
        const products = await Product.find({
            userId: req.user.userId
        });
        console.log("TOKEN userId:", req.user.userId);

        res.json({
            success: true,
            products : products
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});



router.get("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.id,
            userId: req.user.userId
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        res.json({
            success: true,
            data: product
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});



router.put("/:id", auth, upload.array("images"), async (req, res) => {
    try {
        const { name, price, stock, images } = req.body || {};

        if (price !== undefined && price < 0) {
            return res.status(400).json({
                message: "Price cannot be negative"
            });
        }

        if (stock !== undefined && stock < 0) {
            return res.status(400).json({
                message: "Stock cannot be negative"
            });
        }

        const updateData = {};

        if (name) updateData.name = name;
        if (price !== undefined) updateData.price = price;
        if (stock !== undefined) updateData.stock = stock;
        if (images !== undefined) updateData.images = images;


        if (req.files && req.files.length > 0) {
            let imageUrls = [];

            for (const file of req.files) {
                const uploadFromBuffer = () => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: "products" },
                            (error, result) => {
                                if (result) resolve(result);
                                else reject(error);
                            }
                        );
                        streamifier.createReadStream(file.buffer).pipe(stream);
                    });
                };

                const result = await uploadFromBuffer();
                imageUrls.push(result.secure_url);
            }

            updateData.images = imageUrls;
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            message: "Product updated successfully",
            product
        });

    } catch (err) {
        res.status(500).json({
            message: "Update failed",
            error: err.message
        });
    }
});



router.delete("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({ message: "Product deleted" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;