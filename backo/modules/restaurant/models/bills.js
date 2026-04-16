const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
    orderId: String,
    totalAmount: Number,
    paymentStatus: { type: String, default: "UNPAID" }
}, { timestamps: true });

module.exports = mongoose.model("RestaurantBill", billSchema);