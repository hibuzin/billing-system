const express = require("express");
const router = express.Router();
const KOT = require("../models/KOT");


router.post("/create", async (req, res) => {
    try {
        const { tableNumber, items } = req.body;

        if (!tableNumber || !items || !items.length) {
            return res.status(400).json({ message: "tableNumber and items required" });
        }

        const kot = new KOT({ tableNumber, items });
        await kot.save();

        const io = req.app.get("io");
        io.to("kitchen").emit("new_kot", kot);

        res.status(201).json({ message: "KOT created", kot });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.put("/add-items", async (req, res) => {
    try {
        const { kotId, items } = req.body;

        const kot = await KOT.findById(kotId);
        if (!kot) return res.status(404).json({ message: "KOT not found" });

        items.forEach(item => kot.items.push(item));

        await kot.save();

        const io = req.app.get("io");
        io.to("kitchen").emit("update_kot", kot);

        res.json({ message: "Items added", kot });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.put("/update-item", async (req, res) => {
    try {
        const { kotId, itemId, status } = req.body;


        const allowedStatus = ["PENDING", "PREPARING", "READY"];
        if (!allowedStatus.includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const kot = await KOT.findById(kotId);
        if (!kot) return res.status(404).json({ message: "KOT not found" });

        const item = kot.items.id(itemId);
        if (!item) return res.status(404).json({ message: "Item not found" });


        item.status = status;

        const allReady = kot.items.every(i => i.status === "READY");

        if (allReady) {
            kot.status = "COMPLETED";
        }

        await kot.save();


        const io = req.app.get("io");
        io.to("kitchen").emit("update_kot", kot);

        res.json({
            message: `Item updated to ${status}`,
            kot
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get("/active", async (req, res) => {
    try {
        const kots = await KOT.find({ status: "OPEN" });
        res.json(kots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.put("/complete/:id", async (req, res) => {
    try {
        const kot = await KOT.findByIdAndUpdate(
            req.params.id,
            { status: "COMPLETED" },
            { new: true }
        );

        if (!kot) return res.status(404).json({ message: "KOT not found" });

        const io = req.app.get("io");
        io.to("kitchen").emit("update_kot", kot);

        res.json({ message: "KOT completed", kot });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;