const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    tableId: String,
    items: [
        {
            name: String,
            qty: Number,
            price: Number,
            status: { type: String, default: "PENDING" } // KOT
        }
    ],
    status: { type: String, default: "OPEN" }
}, { timestamps: true });

module.exports = mongoose.model("RestaurantOrder", orderSchema);