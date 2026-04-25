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
                status: "OPEN",
                userId: req.user.userId
            });

            await bill.save();
        } else {
            bill = await Bill.findOne({
                _id: billId,
                userId: req.user.userId
            });

            if (!bill) {
                return res.status(404).json({ message: "Bill not found" });
            }

            if (bill.status !== "OPEN") {
                return res.status(400).json({
                    message: "Cannot modify CLOSED or HOLD bill"
                });
            }
        }

        for (const item of items) {
            let { productId, qty } = item;
            qty = Number(qty) || 1;

            if (!productId) continue;

            const product = await Product.findById(productId);
            if (!product) continue;

            const existing = bill.items.find(i =>
                i.productId?.toString() === productId.toString()
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
        }


        bill.totalAmount = bill.items.reduce(
            (sum, i) => sum + i.price * i.qty,
            0
        );

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

        const bill = await Bill.findOne({
            _id: billId,
            userId: req.user.userId
        });

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
                    bill.items = bill.items.filter(
                        i => i.productId.toString() !== productId.toString()
                    );
                }
                continue;
            }


            if (existing) {
                existing.qty = qty;
            }

            else {
                bill.items.push({
                    productId: product._id,
                    name: product.name,
                    price: product.price,
                    image: product.images?.[0],
                    qty
                });
            }
        }


        bill.totalAmount = bill.items.reduce(
            (sum, i) => sum + i.price * i.qty,
            0
        );

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

        const bill = await Bill.findOne({
            _id: billId,
            userId: req.user.userId
        });


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

        // ➕ INCREASE QTY
        if (action === "inc") {
            item.qty += 1;
        }

        // ➖ DECREASE QTY
        if (action === "dec") {
            item.qty -= 1;

            if (item.qty <= 0) {
                bill.items.splice(itemIndex, 1);
            }
        }

        // 💰 recalculate total
        bill.totalAmount = bill.items.reduce(
            (sum, i) => sum + i.price * i.qty,
            0
        );

        await bill.save();

        const io = req.app.get("io");
        if (io) {
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
        const bill = await Bill.findOne({
            _id: req.params.id,
            userId: req.user.userId
        });

        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }

        if (bill.status === "CLOSED") {
            return res.status(400).json({
                message: "Bill already closed"
            });
        }

        if (!bill.items || bill.items.length === 0) {
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
        bill.totalAmount = totalAmount;

        await bill.save();

        const receipt = {
            shopName: "AR Traders",
            date: new Date().toLocaleString("en-IN"),
            billId: bill._id,
            items: bill.items,
            totalAmount
        };

        const io = req.app.get("io");
        if (io) {
            io.emit("billUpdated", bill);
        }

        const createdDate = new Date(bill.createdAt);

        const formattedDate = createdDate.toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata"
        });

        const formattedTime = createdDate.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour12: true
        });

        res.json({
            success: true,
            bill,
            date: formattedDate,
            time: formattedTime
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/repeat-last-bill", auth, async (req, res) => {
    try {

        const lastBill = await Bill.findOne({
            status: "CLOSED",
            userId: req.user.userId
        }).sort({ createdAt: -1 });

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
            status: "OPEN",
            userId: req.user.userId
        });

        const io = req.app.get("io");


        for (const item of lastBill.items) {

            newBill.items.push({
                productId: item.productId,
                name: item.name,
                price: item.price,
                image: item.image,
                qty: item.qty
            });
        }


        newBill.totalAmount = newBill.items.reduce((sum, i) => {
            return sum + i.price * i.qty;
        }, 0);

        await newBill.save();

        if (io) {
            io.emit("billUpdated", newBill);
        }

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

        const bill = await Bill.findOne({
            _id: billId,
            userId: req.user.userId
        });

        if (!bill) return res.status(404).json({ message: "Bill not found" });


        const englishText = await translateToEnglish(text);

        console.log("Translated:", englishText);

        const voiceItems = parseVoice(englishText);
        for (const vItem of voiceItems) {
            const product = await Product.findOne({
                name: { $regex: vItem.name, $options: "i" },
                userId: req.user.userId
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

            bill.totalAmount = bill.items.reduce(
                (sum, i) => sum + i.price * i.qty,
                0
            );

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

        const bill = await Bill.findOne({
            _id: billId,
            userId: req.user.userId
        });

        if (!bill) {
            return res.status(404).json({
                message: "Bill not found"
            });
        }


        const createdDate = new Date(bill.createdAt);

        const formattedDate = createdDate.toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata"
        });

        const formattedTime = createdDate.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour12: true
        });


        res.json({
            success: true,
            bill,
            date: formattedDate,
            time: formattedTime
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

        const bill = await Bill.findOne({
            _id: billId,
            userId: req.user.userId
        });

        if (!bill) {
            return res.status(404).json({ message: "Bill not found or not authorized" });
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


router.put("/hold/:billId", auth, async (req, res) => {
    try {
        const { items, note } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ message: "Items required" });
        }

        const bill = await Bill.findOne({
            _id: req.params.billId,
            userId: req.user.userId,
            status: "HOLD"
        });

        if (!bill) {
            return res.status(404).json({ message: "HOLD bill not found" });
        }

        let totalAmount = 0;
        const updatedItems = [];

        for (let item of items) {
            if (!item.productId || item.qty <= 0) continue;

            const product = await Product.findById(item.productId);
            if (!product) continue;

            const itemTotal = product.price * item.qty;
            totalAmount += itemTotal;

            updatedItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                qty: item.qty,
                image: product.images?.[0] || null,
                total: itemTotal
            });
        }

        bill.items = updatedItems;
        bill.totalAmount = totalAmount;

        if (note !== undefined) {
            bill.note = note;
        }

        await bill.save();

        res.json({
            success: true,
            message: "HOLD bill updated",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get("/hold-orders", auth, async (req, res) => {
    try {
        const bills = await Bill.find({ status: "HOLD", userId: req.user.userId })
            .sort({ heldAt: -1 });

        const formatted = bills.map(bill => ({
            billId: bill._id,
            totalAmount: bill.totalAmount,
            itemsCount: bill.items.length,
            heldAt: bill.heldAt,
            note: bill.note || null,
            preview: bill.items?.[0]?.name || "No items"
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

router.post("/resume/:billId", auth, async (req, res) => {
    try {
        const bill = await Bill.findOne({
            _id: req.params.billId,
            userId: req.user.userId,
            status: "HOLD"
        });

        if (!bill) {
            return res.status(404).json({ message: "HOLD bill not found" });
        }

        bill.status = "OPEN";
        bill.heldAt = null;

        await bill.save();

        res.json({
            success: true,
            message: "Bill resumed",
            bill
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/sync-bills", auth, async (req, res) => {
    try {
        const { bills } = req.body;

        if (!Array.isArray(bills)) {
            return res.status(400).json({ message: "Invalid data" });
        }

        const result = [];

        for (let b of bills) {

            const bill = await Bill.findOneAndUpdate(
                { localId: b.localId },
                {
                    $setOnInsert: {
                        ...b,
                        synced: true
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            result.push(bill);
        }

        res.json({
            success: true,
            syncedCount: result.length
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get("/top-products", auth, async (req, res) => {
    try {
        const min = Number(req.query.min) || 30;

        const result = await Bill.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.user.userId)
                }
            },

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
        const max = Number(req.query.max) || 30;
        const limit = Number(req.query.limit) || 30;

        const userId = new mongoose.Types.ObjectId(req.user.userId);

        const result = await Product.aggregate([

            
            {
                $match: {
                    userId: userId
                }
            },

            {
                $lookup: {
                    from: "bills",
                    let: { productId: { $toString: "$_id" } },
                    pipeline: [

                        // ✅ 2. Filter bills of this user
                        {
                            $match: {
                                userId: userId
                            }
                        },

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


router.get("/sales/today", auth, async (req, res) => {
    try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    userId: userId,
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

router.get("/sales/week", auth, async (req, res) => {
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
                    userId: userId,
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

router.get("/sales/month", auth, async (req, res) => {
    try {
        const now = new Date();

        
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);

        // End of today (or you can use end of month if needed)
        const lastDay = new Date();
        lastDay.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    userId: userId, 
                    createdAt: { $gte: start, $lte: end }
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
                totalBills: stats.totalBills,
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

router.get("/sales/year", auth, async (req, res) => {
    try {
        const now = new Date();


        const firstDay = new Date(now.getFullYear(), 0, 1);
        firstDay.setHours(0, 0, 0, 0);


        const lastDay = new Date();
        lastDay.setHours(23, 59, 59, 999);

        const result = await Bill.aggregate([
            {
                $match: {
                    userId: userId, 
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