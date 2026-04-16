const Order = require("../models/order");

const getPendingKOT = async () => {
    return await Order.find({ "items.status": "PENDING" });
};

module.exports = { getPendingKOT };