const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/product");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const bwipjs = require("bwip-js");
const { v4: uuidv4 } = require("uuid");
const auth = require("../middleware/auth");
const { UploadStream } = require("cloudinary");

router.post("/", auth, upload.array("images"), async (req, res) => {
    try {
        const { name, price, stock } = req.body;

        if (!name || !price || !stock) {
            return res.status(400).json({
                message: "Name, price and stock required"
            });
        }

        const barcode = uuidv4().slice(0, 8);

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
            barcode,
            images: imageUrls
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

router.get("/", async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});






router.get("/scan/:barcode", async (req, res) => {
    try {
        const product = await Product.findOne({
            barcode: req.params.barcode,
        });

        if (!product) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(product);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.put("/:id", auth, upload.array("images"), async (req, res) => {
    try {
        console.log(req.file);
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
        if (images !== undefined) { updateData.images = images; }

        if (req.file) {
            updateData.images = [req.file.path];
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            updateData,
            { returnDocument: "after", runValidators: true }
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
        await Product.findByIdAndDelete(req.params.id);
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


router.get("/barcode/:code", async (req, res) => {
    try {
        const png = await bwipjs.toBuffer({
            bcid: "code128",
            text: req.params.code,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: "center",
        });

        res.set("Content-Type", "image/png");
        res.send(png);

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