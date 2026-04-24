const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            name: String,
            price: Number,
            qty: Number,
            image: String
        }
    ],

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true   
    },

    invoiceNumber: {
        type: Number,
        unique: true
    },
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },

    localId: {
        type: String,
        unique: true
    },

    synced: {
        type: Boolean,
        default: false
    },

    taxAmount: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: ["OPEN", "HOLD", "CLOSED"],
        default: "OPEN"
    },
    heldAt: Date,
    note: String

}, { timestamps: true });

module.exports =
    mongoose.models.RetailBill ||
    mongoose.model("RetailBill", billSchema);