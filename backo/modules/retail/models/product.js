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

    stock: {
        type: Number,
        default: 0,
    },
    images: {
        type: [String],
        default: []
    }

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
    mongoose.models.RetailProduct ||
    mongoose.model("RetailProduct", productSchema);