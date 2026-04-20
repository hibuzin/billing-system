const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    items: [
        {
            productId: String,
            name: String,
            price: Number,
            qty: Number,
            image: String
        }
    ],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },

    status: {
        type: String,
        enum: [ "ongoing","OPEN", "HOLD", "CLOSED"],
        default: "OPEN"
    },
    heldAt: Date,
    note: String

}, { timestamps: true });

module.exports =
    mongoose.models.RetailBill ||
    mongoose.model("RetailBill", billSchema);