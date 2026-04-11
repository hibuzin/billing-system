const express = require("express");
const router = express.Router();
const Order = require("../models/order");
const Product = require("../models/product");
const { v4: uuidv4 } = require("uuid");

router.post("/", async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "No items in order" });
        }

        const productIds = items.map(i => i.productId);
        const products = await Product.find({ _id: { $in: productIds } });

        let total = 0;
        let processedItems = [];

        for (let item of items) {
            const product = products.find(p => p._id.toString() === item.productId);

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

        const order = new Order({
            orderId: uuidv4(),
            items: processedItems,
            total: total,
            status: "pending"
        });

        await order.save();

        res.json(order);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;