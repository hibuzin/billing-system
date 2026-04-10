require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");

const app = express();



app.use(cors());
app.use(express.json());

const productRoutes = require("./routes/product");
const orderRoutes = require("./routes/order");
const billRoutes = require("./routes/bill");

app.get("/", (req, res) => {
    res.send("API running");
});

app.use("/api/product", productRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/bill", billRoutes);

app.get("/", (req, res) => {
    res.send("API running");
});


const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mydb";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));