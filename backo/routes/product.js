const express = require("express");
const router = express.Router();
const Product = require("../models/product");
const bwipjs = require('bwip-js');
const { v4: uuidv4 } = require("uuid");


router.post("/", async (req, res) => {
    try {
        const barcode = uuidv4().slice(0, 8);

        const product = new Product({
            ...req.body,
            barcode,
        });

        await product.save();

        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/:barcode", async (req, res) => {
    const product = await Product.findOne({
        barcode: req.params.barcode,
    });

    if (!product) {
        return res.status(404).json({ message: "Not found" });
    }

    res.json({
        _id: product._id,
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        stock: product.stock,
    });
});

router.get("/", async (req, res) => {
    try {
        const products = await Product.find();

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put("/:id", async (req, res) => {
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


router.delete("/:id", async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);

        res.json({ message: "Product deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get("/barcode/:code", async (req, res) => {
    try {
        const { code } = req.params;

        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: code,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center',
        });

        res.set('Content-Type', 'image/png');
        res.send(png);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get("/", async (req, res) => {
    const products = await Product.find();
    res.json(products);
});


router.get("/:barcode", async (req, res) => {
    const product = await Product.findOne({
        barcode: req.params.barcode,
    });

    if (!product) {
        return res.status(404).json({ message: "Not found" });
    }

    res.json(product);
});


module.exports = router;