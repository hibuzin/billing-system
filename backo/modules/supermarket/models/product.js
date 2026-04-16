
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

}, { timestamps: true });



productSchema.virtual("stockStatus").get(function () {
    if (this.stock <= 2) return "CRITICAL";
    if (this.stock <= 5) return "LOW";
    if (this.stock <= 10) return "MEDIUM";
    return "HIGH";
});


productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });


module.exports =
    mongoose.models.SupermarketProduct ||
    mongoose.model("SupermarketProduct", productSchema);