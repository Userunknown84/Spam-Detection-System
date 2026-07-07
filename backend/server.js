require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]); // ensure SRV records resolve on all networks
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();

// Connect to MongoDB Atlas
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.use(cors());
app.use(express.json());

// Auth routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const { protect } = require("./middleware/authMiddleware");

app.get("/", (req, res) => {
  res.send("Node backend running ");
});

// Protected: only authenticated users can predict
app.post("/predict", protect, async (req, res) => {
  try {
    const { text, type } = req.body;

    // Check 1: fields must exist
    if (!text || !type) {
      return res.status(400).json({ error: "Text and type are required" });
    }

    // Check 2: must be strings
    if (typeof text !== "string" || typeof type !== "string") {
      return res.status(400).json({ error: "Text and type must be strings." });
    }

    // Check 3: must not be empty or only whitespace
    if (text.trim().length === 0) {
      return res.status(400).json({ error: "Text must not be empty or whitespace." });
    }

    // Check 4: validate type is one of the accepted values
    const allowedTypes = ["sms", "email", "url", "message"];
    if (!allowedTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid type. Allowed values are: ${allowedTypes.join(", ")}.`,
      });
    }

    // Check 5: validate text length
     if (text.trim().length > 5000) {
      return res.status(413).json({
        error: "Text payload exceeds maximum allowed length of 5000 characters.",
      });
    }

    const response = await axios.post(process.env.API || "http://localhost:5000/predict", {
      text: text.trim(),
      type: type.toLowerCase(),
    });

    res.json(response.data);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: record user feedback on a prediction (forwarded to the ML API)
const ML_API_BASE = (process.env.API || "http://localhost:5000/predict").replace(/\/predict$/, "");

app.post("/feedback", protect, async (req, res) => {
  try {
    const { text, predicted_label, correct_label } = req.body;

    if (!text || !correct_label) {
      return res
        .status(400)
        .json({ error: "text and correct_label are required" });
    }

    const response = await axios.post(`${ML_API_BASE}/feedback`, {
      text,
      predicted_label,
      correct_label,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/feedback/summary", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/feedback/summary`);
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/feedback/history", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/feedback/history`);
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: analyze email headers for authenticity (forwarded to ML API)
app.post("/analyze-email-header", protect, async (req, res) => {
  try {
    const { headers } = req.body;

    if (!headers) {
      return res.status(400).json({ error: "Email headers are required" });
    }

    if (typeof headers !== "string") {
      return res.status(400).json({ error: "Email headers must be a string." });
    }

    if (headers.trim().length === 0) {
      return res.status(400).json({ error: "Email headers must not be empty." });
    }

    const response = await axios.post(`${ML_API_BASE}/analyze-email-header`, {
      headers: headers,
    });

    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
