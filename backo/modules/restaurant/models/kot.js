
const mongoose = require("mongoose");

const kotItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    quantity: Number,
    status: {
        type: String,
        enum: ["PENDING", "PREPARING", "READY"],
        default: "PENDING"
    }
});

const kotSchema = new mongoose.Schema({
    tableNumber: Number,
    items: [kotItemSchema],
    status: {
        type: String,
        enum: ["OPEN", "COMPLETED"],
        default: "OPEN"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("KOT", kotSchema);