// ✅ GET USER FIRST
const username = localStorage.getItem("username");

if (!username) {
    window.location.href = "/login.html";
}

document.getElementById("username").innerText = "Logged in as: " + username;
document.getElementById("userTop").innerText = username;
// SOCKET SETUP
const socket = io();

const chatBox = document.getElementById("chat-box");
const status = document.getElementById("status");

let connected = false;

// JOIN CHAT
socket.emit("join");

// CONNECTION EVENTS
socket.on("chat-start", () => {
    connected = true;
    status.innerText = "🟢 Connected to stranger";
});

socket.on("message", (msg) => {
    addMessage(msg, "stranger");
});

socket.on("typing", () => {
    status.innerText = "✍️ Stranger typing...";
    setTimeout(() => {
        status.innerText = connected
            ? "🟢 Connected to stranger"
            : "🟡 Waiting...";
    }, 1000);
});

socket.on("partner-disconnected", () => {
    connected = false;
    status.innerText = "🔴 Stranger disconnected";
});

// SEND MESSAGE
function sendMessage() {
    if (!connected) return alert("Not connected");

    const input = document.getElementById("msg");
    const msg = input.value;

    if (!msg.trim()) return;

    addMessage(msg, "me");
    socket.emit("message", msg);
    input.value = "";
}

// ADD MESSAGE TO UI
function addMessage(text, type) {
    const div = document.createElement("div");
    div.className = "message " + type;

    const time = new Date().toLocaleTimeString();

    div.innerHTML = `
        <div>${text}</div>
        <small style="opacity:0.6;">${time}</small>
    `;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// NEXT USER
function nextUser() {
    chatBox.innerHTML = "";
    connected = false;
    status.innerText = "🟡 Finding new partner...";
    socket.emit("next");
}

// LOGOUT WITH CONFIRMATION
function logout() {
    const confirmLogout = confirm("Are you sure you want to logout?");
    if (!confirmLogout) return;

    localStorage.removeItem("username");

    if (socket) socket.disconnect();

    window.location.href = "/login.html";
}

// EVENTS
document.getElementById("msg").addEventListener("input", () => {
    socket.emit("typing");
});

document.getElementById("msg").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});