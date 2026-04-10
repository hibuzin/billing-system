const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    items: [
        {
            productId: String,
            name: String,
            price: Number,
            qty: Number
        }
    ],
    total: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        default: "active"
    }
}, { timestamps: true });

module.exports = mongoose.model("Bill", billSchema);