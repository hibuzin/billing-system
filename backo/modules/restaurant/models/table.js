const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema({
    tableNumber: Number,
    status: { type: String, default: "FREE" }
});

module.exports = mongoose.model("RestaurantTable", tableSchema);