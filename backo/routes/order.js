const express = require("express");
const router = express.Router();
const Order = require("../models/order");
const Product = require("../models/product");

router.post("/", async (req, res) => {
    try {
        const { items } = req.body;

        let total = 0;
        let processedItems = [];

        for (let item of items) {
            const product = await Product.findById(item.productId);

            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }

            const subtotal = product.price * item.quantity;
            total += subtotal;

            processedItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                quantity: item.quantity,
                subtotal: subtotal,
            });
        }

        // 🔥 IMPORTANT: include total
        const order = new Order({
            items: processedItems,
            total: total,
        });

        await order.save();

        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;