require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let collection;

async function startServer() {
  try {
    // Attempt to connect to MongoDB
    await client.connect();
    const db = client.db("brandpulse");
    collection = db.collection("reddit_posts");
    console.log("✅ MongoDB connected successfully");

    // Start listening only after DB connection is established
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1); // Exit if we can't connect to the database
  }
}

// ----------- STORE POSTS API -----------
app.post("/store-posts", async (req, res) => {
  try {
    const posts = req.body;

    // Validation: Ensure we received an array
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No posts received or invalid format" 
      });
    }

    // Bulk operations to avoid duplicates using the 'postId' field
    const ops = posts.map(p => ({
      updateOne: {
        filter: { postId: p.postId },
        update: { $set: p },
        upsert: true
      }
    }));

    const result = await collection.bulkWrite(ops);

    res.status(200).json({
      success: true,
      message: "Data processed",
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount
    });

  } catch (err) {
    console.error("Error during bulkWrite:", err);
    res.status(500).json({ 
      success: false, 
      error: "Error storing posts to database" 
    });
  }
});

// Graceful Shutdown
process.on("SIGINT", async () => {
  await client.close();
  console.log("MongoDB connection closed. App exiting.");
  process.exit(0);
});

// Initialize the app
startServer();