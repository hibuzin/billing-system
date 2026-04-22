const express = require("express");
const router = express.Router();
const Bill = require("../models/bill");
const Product = require("../models/product");
const auth = require("../../../middleware/auth");
const mongoose = require("mongoose");
const translate = require("@vitalets/google-translate-api");


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

    // handle last item
    if (nameParts.length > 0) {
        items.push({ name: nameParts.join(" "), qty: 1 });
    }

    return items;
}



router.post("/add-products", auth, async (req, res) => {
    try {
        let { billId, items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                message: "items array required"
            });
        }

        let bill;


        if (!billId) {
            bill = new Bill({
                items: [],
                totalAmount: 0,
                status: "OPEN"
            });

            await bill.save();
        } else {

            bill = await Bill.findById(billId);

            if (!bill) {
                return res.status(404).json({ message: "Bill not found" });
            }


            if (bill.status !== "OPEN") {
                return res.status(400).json({
                    message: "Cannot modify CLOSED or HOLD bill"
                });
            }
        }

        const stockUpdates = [];


        for (const item of items) {
            let { productId, qty } = item;
            qty = Number(qty) || 1;

            if (!productId) continue;

            const product = await Product.findById(productId);

            if (!product) {
                console.log("Product not found, skipping");
                continue;
            }

            const existing = bill.items.find(i =>
                i.productId?.toString() === productId?.toString()
            );

            if (existing) {
                existing.qty += qty;
            } else {
                bill.items.push({
                    productId: product._id,
                    name: product.name,
                    price: product.price,
                    image: product.images?.[0],
                    qty
                });
            }

            bill.totalAmount = bill.items.reduce((sum, i) => {
                return sum + (i.price * i.qty);
            }, 0);

            await Product.findByIdAndUpdate(product._id, {
                $inc: { stock: -qty }
            });
        }

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            billId: bill._id,
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put("/update-products", auth, async (req, res) => {
    try {
        const { billId, items } = req.body;

        if (!billId) {
            return res.status(400).json({ message: "billId required" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "items array required" });
        }

        const bill = await Bill.findById(billId);

        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        if (bill.status !== "OPEN") {
            return res.status(400).json({
                message: "Cannot modify CLOSED or HOLD bill"
            });
        }

        for (const item of items) {
            let { productId, qty } = item;

            if (!productId) continue;

            qty = Number(qty);

            const product = await Product.findById(productId);
            if (!product) continue;

            const existing = bill.items.find(
                i => i.productId.toString() === productId.toString()
            );


            if (qty === 0) {
                if (existing) {
                    // restore stock
                    await Product.findByIdAndUpdate(productId, {
                        $inc: { stock: existing.qty }
                    });

                    bill.items = bill.items.filter(
                        i => i.productId.toString() !== productId.toString()
                    );
                }
                continue;
            }


            if (existing) {
                const diff = qty - existing.qty;

                existing.qty = qty;


                await Product.findByIdAndUpdate(productId, {
                    $inc: { stock: -diff }
                });

            } else {

                bill.items.push({
                    productId: product._id,
                    name: product.name,
                    price: product.price,
                    image: product.images?.[0],
                    qty
                });

                await Product.findByIdAndUpdate(productId, {
                    $inc: { stock: -qty }
                });
            }
        }


        bill.totalAmount = bill.items.reduce((sum, i) => {
            return sum + i.price * i.qty;
        }, 0);

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Bill updated successfully",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put("/update-qty", auth, async (req, res) => {
    try {
        const { billId, productId, action } = req.body;


        if (!billId || !productId || !action) {
            return res.status(400).json({
                success: false,
                message: "billId, productId and action are required"
            });
        }

        if (!["inc", "dec"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Invalid action (use 'inc' or 'dec')"
            });
        }


        const bill = await Bill.findById(billId);
        if (!bill) {
            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }


        if (bill.status !== "OPEN") {
            return res.status(400).json({
                success: false,
                message: "Cannot modify CLOSED or HOLD bill"
            });
        }


        const itemIndex = bill.items.findIndex(
            i => i.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Item not found in bill"
            });
        }

        const item = bill.items[itemIndex];


        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        let newStock;

        // ➕ increase qty
        if (action === "inc") {
            if (product.stock <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Out of stock"
                });
            }

            item.qty += 1;

            const updatedProduct = await Product.findOneAndUpdate(
                { _id: productId },
                { $inc: { stock: -1 } },
                { returnDocument: "after" }
            );

            newStock = updatedProduct.stock;
        }


        if (action === "dec") {
            item.qty -= 1;

            const updatedProduct = await Product.findByIdAndUpdate(
                productId,
                { $inc: { stock: 1 } },
                { new: true }
            );

            newStock = updatedProduct.stock;


            if (item.qty <= 0) {
                bill.items.splice(itemIndex, 1);
            }
        }


        bill.totalAmount = bill.items.reduce(
            (sum, i) => sum + i.price * i.qty,
            0
        );

        await bill.save();


        const io = req.app.get("io");
        if (io) {
            io.emit("stockUpdated", { productId, stock: newStock });
            io.emit("billUpdated", bill);
        }

        return res.status(200).json({
            success: true,
            message: "Quantity updated successfully",
            data: {
                billId: bill._id,
                productId,
                action,
                bill
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

router.post("/print/:id", auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);

        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }


        if (bill.status === "CLOSED") {
            return res.status(400).json({
                message: "Bill already closed"
            });
        }


        if (bill.items.length === 0) {
            return res.status(400).json({
                message: "Cannot print empty bill"
            });
        }

        const totalAmount = bill.items.reduce(
            (sum, item) => sum + item.qty * item.price,
            0
        );


        bill.status = "CLOSED";
        bill.closedAt = new Date();
        await bill.save();

        const receipt = {
            shopName: "AR Traders",
            date: new Date().toLocaleString(),
            billId: bill._id,
            items: bill.items,
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

router.post("/repeat-last-bill", auth, async (req, res) => {
    try {

        const lastBill = await Bill.findOne({ status: "CLOSED" })
            .sort({ createdAt: -1 });

        if (!lastBill) {
            return res.status(404).json({
                message: "No previous bill found"
            });
        }

        if (!lastBill.items || lastBill.items.length === 0) {
            return res.status(400).json({
                message: "Last bill has no items"
            });
        }

        const newBill = new Bill({
            items: [],
            totalAmount: 0,
            status: "OPEN"
        });

        const io = req.app.get("io");

        for (const item of lastBill.items) {
            const product = await Product.findById(item.productId);

            if (!product) continue;


            if (product.stock < item.qty) {
                return res.status(400).json({
                    message: `Not enough stock for ${product.name}`
                });
            }


            newBill.items.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                image: product.images?.[0],
                qty: item.qty
            });


            const updatedProduct = await Product.findByIdAndUpdate(
                product._id,
                { $inc: { stock: -item.qty } },
                { new: true }
            );

            io.emit("stockUpdated", {
                productId: product._id,
                stock: updatedProduct.stock
            });
        }


        newBill.totalAmount = newBill.items.reduce((sum, i) => {
            return sum + i.price * i.qty;
        }, 0);

        await newBill.save();

        io.emit("billUpdated", newBill);

        res.json({
            success: true,
            message: "Last bill repeated successfully",
            billId: newBill._id,
            bill: newBill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/voice-add", auth, async (req, res) => {

    try {

        const { billId, text } = req.body;

        if (!billId || !text) {
            return res.status(400).json({
                message: "billId and text required"
            });
        }

        const bill = await Bill.findById(billId);
        if (!bill) return res.status(404).json({ message: "Bill not found" });


        const englishText = await translateToEnglish(text);

        console.log("Translated:", englishText);

        const voiceItems = parseVoice(englishText);
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


router.get("/get-bill/:billId", auth, async (req, res) => {
    try {
        const { billId } = req.params;

        if (!billId) {
            return res.status(400).json({
                message: "billId required"
            });
        }

        const bill = await Bill.findById(billId);

        if (!bill) {
            return res.status(404).json({
                message: "Bill not found"
            });
        }

        res.json({
            success: true,
            bill
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
});

router.post("/hold", auth, async (req, res) => {
    try {
        const { billId, note } = req.body;

        if (!billId) {
            return res.status(400).json({ message: "billId required" });
        }

        const bill = await Bill.findById(billId);

        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        if (bill.status !== "OPEN") {
            return res.status(400).json({ message: "Only OPEN bills can be held" });
        }


        if (note) {
            bill.note = note;
        }

        bill.status = "HOLD";
        bill.heldAt = new Date();

        await bill.save();

        const io = req.app.get("io");
        io.emit("billUpdated", bill);

        res.json({
            success: true,
            message: "Bill moved to HOLD",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get("/hold-orders", auth, async (req, res) => {
    try {
        const bills = await Bill.find({ status: "HOLD" })
            .sort({ heldAt: -1 });

        const formatted = bills.map(bill => ({
            billId: bill._id,
            totalAmount: bill.totalAmount,
            itemsCount: bill.items.length,
            heldAt: bill.heldAt,
            note: bill.note || null,

            // preview first item
            preview: bill.items[0]?.name || "No items"
        }));

        res.json({
            success: true,
            count: formatted.length,
            bills: formatted
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


router.get("/sales/today", async (req, res) => {
    try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end }
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

        const stats = result[0] || { totalSales: 0, count: 0 };

        res.json({
            success: true,
            data: {
                totalSales: stats.totalSales,
                totalBills: stats.count
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/sales/week", async (req, res) => {
    try {
        const now = new Date();

        const firstDay = new Date(now);
        firstDay.setDate(now.getDate() - now.getDay());
        firstDay.setHours(0, 0, 0, 0);

        const lastDay = new Date();
        lastDay.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
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

        const stats = result[0] || { totalSales: 0, count: 0 };

        const toIST = (date) =>
            new Date(date).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            });

        res.json({
            success: true,
            data: {
                totalSales: stats.totalSales,
                totalBills: stats.count,
                from: toIST(firstDay),
                to: toIST(lastDay),
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/sales/month", async (req, res) => {
    try {
        const now = new Date();

        // Start of month
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);

        // End of today (or you can use end of month if needed)
        const lastDay = new Date();
        lastDay.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    totalBills: { $sum: 1 }
                }
            }
        ]);

        const stats = result[0] || { totalSales: 0, totalBills: 0 };

        const toIST = (date) =>
            new Date(date).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            });

        res.json({
            success: true,
            data: {
                totalSales: stats.totalSales,
                totalBills: stats.count,
                from: toIST(firstDay),
                to: toIST(lastDay),
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.get("/sales/year", async (req, res) => {
    try {
        const now = new Date();

        // Start of year
        const firstDay = new Date(now.getFullYear(), 0, 1);
        firstDay.setHours(0, 0, 0, 0);

        // End of today (or full year option below)
        const lastDay = new Date();
        lastDay.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    createdAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    totalBills: { $sum: 1 }
                }
            }
        ]);

        const stats = result[0] || { totalSales: 0, totalBills: 0 };

        const toIST = (date) =>
            new Date(date).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            });

        res.json({
            success: true,
            data: {
                totalSales: stats.totalSales,
                totalBills: stats.count,
                from: toIST(firstDay),
                to: toIST(lastDay),
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;