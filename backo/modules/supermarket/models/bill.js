const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    items: [
        {
            productId: String,
            name: String,
            price: Number,
            qty: Number,
            
        }
    ],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },



}, { timestamps: true });

module.exports = mongoose.model("Bill", billSchema);