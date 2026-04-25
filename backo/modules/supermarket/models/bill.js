const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    billNumber: {
        type: String,
        unique: true,
       required: false
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    items: [
        {
            productId: mongoose.Schema.Types.ObjectId,
            name: String,
            price: Number,
            qty: Number
        }
    ],

    totalAmount: {
        type: Number,
        default: 0
    },

    isActive: {
        type: Boolean,
        default: true
    },

    status: {
        type: String,
        enum: ["OPEN", "CLOSED"],
        default: "OPEN"
    }
}, { timestamps: true });

module.exports = mongoose.model("Bill", billSchema);