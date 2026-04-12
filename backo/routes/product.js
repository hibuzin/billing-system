const express = require("express");
const router = express.Router();
const Product = require("../models/product");
const upload = require("../middleware/upload");

const bwipjs = require("bwip-js");
const { v4: uuidv4 } = require("uuid");
const auth = require("../middleware/auth");

router.post("/", auth, upload.array("images"), async (req, res) => {
    try {
        const barcode = uuidv4().slice(0, 8);

        const images = req.files.map(file => file.path);
        

        const product = new Product({
            name: req.body.name,
            price: req.body.price,
            stock: req.body.stock,
            barcode,
            images
        });

        await product.save();

        res.json({
            success: true,
            product
        });

    } catch (err) {
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



router.put("/:id", auth, async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json(product);

    } catch (err) {
        res.status(500).json({ error: err.message });
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

module.exports = router;