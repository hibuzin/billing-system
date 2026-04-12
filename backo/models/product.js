const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    barcode: {
        type: String,
        required: true,
        unique: true, 
    },
    stock: {
        type: Number,
        default: 0,
    },

    image: String
    
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);