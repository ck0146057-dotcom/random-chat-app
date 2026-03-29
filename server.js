require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ ENV VARIABLES
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

// 🔐 Online users
const onlineUsers = {};

// 🔐 Rooms
const rooms = {};

// Middleware
app.use(express.json());
app.use(express.static("public"));

// ✅ DATABASE (DEPLOY READY)
const db = mysql.createConnection(process.env.MYSQL_URL);

db.connect((err) => {
    if (err) {
        console.error("DB Error:", err);
    } else {
        console.log("MySQL Connected ✅");
    }
});

// Default route
app.get("/", (req, res) => {
    res.redirect("/login.html");
});

// ================= AUTH =================

// Signup
app.post("/signup", (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.query(sql, [username, hash], (err) => {
            if (err) return res.send("User already exists");
            res.send("Signup successful");
        });
    });
});

// Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    const sql = "SELECT * FROM users WHERE username=?";
    db.query(sql, [username], (err, result) => {
        if (result.length > 0) {
            bcrypt.compare(password, result[0].password, (err, match) => {
                if (match) res.send("Login success");
                else res.send("Invalid credentials");
            });
        } else {
            res.send("Invalid credentials");
        }
    });
});

// ================= FRIEND SYSTEM =================

// SEND REQUEST
app.post("/send-request", (req, res) => {
    const { from, to } = req.body;

    const sql = "INSERT INTO friends (sender, receiver) VALUES (?, ?)";
    db.query(sql, [from, to], (err) => {
        if (err) return res.send("Request failed");
        res.send("Request sent");
    });
});

// GET REQUESTS
app.get("/requests/:user", (req, res) => {
    const user = req.params.user;

    const sql = "SELECT * FROM friends WHERE receiver=? AND status='pending'";
    db.query(sql, [user], (err, results) => {
        res.json(results);
    });
});

// ACCEPT REQUEST
app.post("/accept-request", (req, res) => {
    const { id } = req.body;

    db.query("UPDATE friends SET status='accepted' WHERE id=?", [id], () => {
        res.send("Accepted");
    });
});

// GET FRIENDS
app.get("/friends/:user", (req, res) => {
    const user = req.params.user;

    const sql = `
        SELECT * FROM friends 
        WHERE (sender=? OR receiver=?) AND status='accepted'
    `;

    db.query(sql, [user, user], (err, results) => {
        res.json(results);
    });
});

// ================= SOCKET =================

let users = [];

io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    // STRANGER CHAT
    socket.on("join", () => {
        if (users.length > 0) {
            let partner = users.shift();

            socket.partner = partner;
            partner.partner = socket;

            socket.emit("chat-start");
            partner.emit("chat-start");
        } else {
            users.push(socket);
        }
    });

    socket.on("message", (msg) => {
        if (socket.partner) socket.partner.emit("message", msg);
    });

    socket.on("typing", () => {
        if (socket.partner) socket.partner.emit("typing");
    });

    socket.on("next", () => {
        if (socket.partner) {
            socket.partner.emit("partner-disconnected");
            socket.partner.partner = null;
        }

        socket.partner = null;
        socket.emit("join");
    });

    // REGISTER USER
    socket.on("register-user", (username) => {
        onlineUsers[username] = socket;
        socket.username = username;

        io.emit("online-users", Object.keys(onlineUsers));
    });

    // PRIVATE MESSAGE
    socket.on("private-message", ({ to, message }) => {
        const target = onlineUsers[to];

        if (target) {
            target.emit("private-message", {
                from: socket.username,
                message
            });
        }
    });

    // GROUP CHAT
    socket.on("create-room", ({ room, password }) => {
        if (rooms[room]) {
            socket.emit("error-msg", "Room already exists");
            return;
        }

        rooms[room] = { password };

        socket.join(room);
        socket.room = room;

        socket.emit("system", "Room created");
    });

    socket.on("join-room", ({ room, password }) => {
        if (!rooms[room] || rooms[room].password !== password) {
            socket.emit("error-msg", "Invalid room or password");
            return;
        }

        socket.join(room);
        socket.room = room;

        socket.emit("system", "Joined room");
    });

    socket.on("group-message", (msg) => {
        if (socket.room) {
            io.to(socket.room).emit("group-message", msg);
        }
    });

    // DISCONNECT (FIXED SINGLE HANDLER)
    socket.on("disconnect", () => {

        if (socket.partner) {
            socket.partner.emit("partner-disconnected");
            socket.partner.partner = null;
        }

        users = users.filter(u => u !== socket);

        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit("online-users", Object.keys(onlineUsers));
        }
    });
});

// START SERVER
server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
