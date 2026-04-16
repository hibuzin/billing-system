require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const http = require("http");
const { Server } = require("socket.io");

const app = express(); 

const server = http.createServer(app); 

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});


app.set("io", io);

const restaurantModule = require("./modules/restaurant");
const supermarketModule = require("./modules/supermarket");
const retailModule = require("./modules/retail"); 


app.use("/api/restaurant", restaurantModule);
app.use("/api/supermarket", supermarketModule);
app.use("/api/retail", retailModule);

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