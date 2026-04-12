require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const http = require("http");
const { Server } = require("socket.io");

const app = express(); // ✅ FIRST create app

const server = http.createServer(app); // ✅ THEN create server

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Make io available in routes
app.set("io", io);

// Routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/product");
const orderRoutes = require("./routes/order");
const billRoutes = require("./routes/bill");

app.use("/api/auth", authRoutes);
app.use("/api/product", productRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/bill", billRoutes);

// Test route
app.get("/", (req, res) => {
    res.send("API running");
});

// Socket connection
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// DB
const MONGO_URI =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mydb";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB error:", err));

// Server start (IMPORTANT)
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});