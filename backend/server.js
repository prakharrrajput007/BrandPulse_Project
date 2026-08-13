require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
// 🚀 NEW IMPORTS FOR AUTOMATION
const cron = require("node-cron");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let collection;

// ─── SLACK CONFIG ─────────────────────────────────────────────
const SLACK_BOT_TOKEN  = 'xoxb-10581505344880-10553224889122-cGByQGamNYYNwDaugq7nQrQx';
const SLACK_CHANNEL_ID = 'C0AG5QBB02Z';
// ─────────────────────────────────────────────────────────────

async function startServer() {
  try {
    await client.connect();
    const db = client.db("brandpulse");
    collection = db.collection("reddit_posts");
    await collection.createIndex({ postId: 1 }, { unique: true });
    console.log("✅ MongoDB connected successfully");

    const PORT = process.env.PORT || 5050;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`   Hit http://localhost:${PORT}/read-slack        → last 2 days`);
      console.log(`   Hit http://localhost:${PORT}/read-slack?days=7 → last 7 days`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => res.send("Server running ✅"));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════
// 🔄 NORMALIZE POST — maps capital field names → lowercase
// ═══════════════════════════════════════════════════════════════
function normalizePost(post) {
  return {
    postId:      post.PostID      ?? post.postId      ?? '',
    title:       post.Title       ?? post.title       ?? '',
    body:        post.Body        ?? post.body        ?? '',
    createdDate: post.CreatedDate ?? post.createdDate ?? '',
    comments:    post.Comments    ?? post.comments    ?? 0,
    upvotes:     post.Upvotes     ?? post.upvotes     ?? 0,
    subreddit:   post.Subreddit   ?? post.subreddit   ?? '',
    keyword:     post.Keyword     ?? post.keyword     ?? '',
    ecomSite:    post.EcomSite    ?? post.ecomSite    ?? '',
    url:         post.URL         ?? post.url         ?? '',
  };
}

// ═══════════════════════════════════════════════════════════════
// ✅ VALIDATE BLOCK 
// ═══════════════════════════════════════════════════════════════
function parseAndValidateBlock(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0) return null;

  for (const item of parsed) {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      (!item.PostID && !item.postId)
    ) {
      return null;
    }
  }
  return parsed;
}

// ═══════════════════════════════════════════════════════════════
// 📨 /read-slack — Fetches ALL Slack messages from last N days
// ═══════════════════════════════════════════════════════════════
app.get("/read-slack", async (req, res) => {
  try {
    const daysBack        = parseInt(req.query.days || '2', 10);
    const oldestTimestamp = (Date.now() / 1000) - (daysBack * 24 * 60 * 60);
    const fromDate        = new Date(oldestTimestamp * 1000).toISOString();

    console.log(`📨 Fetching Slack messages from last ${daysBack} day(s) (since ${fromDate})...`);

    let allMessages  = [];
    let cursor       = undefined;
    let pageCount    = 0;
    let retryCount   = 0;
    const maxRetries = 3;

    do {
      try {
        const url = new URL('https://slack.com/api/conversations.history');
        url.searchParams.set('channel', SLACK_CHANNEL_ID);
        url.searchParams.set('limit',   '200');
        url.searchParams.set('oldest',  String(oldestTimestamp));
        if (cursor) url.searchParams.set('cursor', cursor);

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type':  'application/json',
          },
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
          console.warn(`⚠️ Slack rate limit hit. Waiting ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          continue;
        }

        const data = await response.json();

        if (!data.ok) {
          console.error(`❌ Slack API error on page ${pageCount + 1}:`, data.error);
          if (retryCount < maxRetries) {
            retryCount++;
            await sleep(2000);
            continue;
          }
          return res.status(500).json({ success: false, error: data.error });
        }

        retryCount = 0;
        const messages = data.messages || [];
        allMessages = allMessages.concat(messages);
        pageCount++;

        console.log(`  📄 Page ${pageCount}: ${messages.length} messages (total so far: ${allMessages.length})`);

        cursor = data.response_metadata?.next_cursor || null;
        if (cursor) await sleep(500); 

      } catch (err) {
        if (retryCount < maxRetries) {
          retryCount++;
          console.error(`❌ Network error, retrying (${retryCount}/${maxRetries}): ${err.message}`);
          await sleep(2000);
        } else {
          throw err;
        }
      }

    } while (cursor);

    console.log(`\n📦 Total Slack messages fetched: ${allMessages.length} across ${pageCount} page(s)`);

    const allPosts     = [];
    let   blocksValid  = 0;
    let   blocksDiscard = 0;

    for (const msg of allMessages) {
      if (!msg.text) {
        blocksDiscard++;
        continue;
      }
      const posts = parseAndValidateBlock(msg.text);
      if (!posts) {
        blocksDiscard++;
        console.log(`  ⛔ Discarded block (not a valid post array)`);
        continue;
      }
      blocksValid++;
      for (const post of posts) {
        allPosts.push(normalizePost(post));
      }
    }

    console.log(`\n✅ Valid blocks   : ${blocksValid}`);
    console.log(`⛔ Discarded blocks: ${blocksDiscard}`);
    console.log(`📬 Total posts     : ${allPosts.length}`);

    if (allPosts.length === 0) {
      return res.status(200).json({
        success:        true,
        message:        `No valid posts found in last ${daysBack} day(s)`,
        slackMessages:  allMessages.length,
        blocksValid,
        blocksDiscarded: blocksDiscard,
      });
    }

    const batchSize = 500;
    let   upserted  = 0;
    let   modified  = 0;
    let   batchNum  = 0;

    for (let i = 0; i < allPosts.length; i += batchSize) {
      const batch = allPosts.slice(i, i + batchSize);
      batchNum++;

      const ops = batch.map(p => ({
        updateOne: {
          filter: { postId: p.postId },
          update: { $set: p },
          upsert: true,
        }
      }));

      const result = await collection.bulkWrite(ops, { ordered: false });
      upserted += result.upsertedCount;
      modified += result.modifiedCount;
      console.log(`  💾 MongoDB batch ${batchNum}: upserted ${result.upsertedCount} | modified ${result.modifiedCount}`);
    }

    console.log(`\n✅ Atlas total — Upserted: ${upserted} | Modified: ${modified}`);

    res.status(200).json({
      success:         true,
      daysBack,
      fromDate,
      slackMessages:   allMessages.length,
      pages:           pageCount,
      blocksValid,
      blocksDiscarded: blocksDiscard,
      postsFound:      allPosts.length,
      upsertedCount:   upserted,
      modifiedCount:   modified,
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STORE POSTS (direct POST endpoint) ──────────────────────
app.post("/store-posts", async (req, res) => {
  try {
    const posts = Array.isArray(req.body) ? req.body : req.body.posts;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ success: false, message: "No posts received or invalid format" });
    }

    const cleanPosts = posts
      .filter(p => p.postId || p.PostID)
      .map(p => normalizePost(p));

    if (cleanPosts.length === 0) {
      return res.status(400).json({ success: false, message: "Posts missing postId" });
    }

    const ops = cleanPosts.map(p => ({
      updateOne: { filter: { postId: p.postId }, update: { $set: p }, upsert: true }
    }));

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(`✅ Stored ${cleanPosts.length} posts`);
    res.status(200).json({
      success:       true,
      message:       "Data processed",
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error during bulkWrite:", err);
    res.status(500).json({ success: false, error: "Error storing posts to database" });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🚀 EVENT-DRIVEN AUTOMATION (PHASE 1)
// ═══════════════════════════════════════════════════════════════
// This cron job runs every night exactly at Midnight (0 0 * * *)
cron.schedule('*/5 * * * *', async () => {
    console.log("\n⏰ Midnight Automation: Starting Slack Scrape...");
    
    try {
        const port = process.env.PORT || 5050;
        
        // 1. Automatically hit your own scrape endpoint
        await axios.get(`http://127.0.0.1:${port}/read-slack`);
        console.log("✅ Slack Scrape Complete & Saved to MongoDB.");

        // 2. Fire the missile to wake up Python!
        console.log("🚀 Triggering Python ML Pipeline...");
        await axios.post('http://127.0.0.1:8000/api/trigger-pipeline');
        console.log("✅ Python Pipeline triggered successfully. Check FastAPI terminal for logs.");
        
    } catch (error) {
        console.error("❌ Automation Error:", error.message);
    }
});

process.on("SIGINT", async () => {
  await client.close();
  console.log("MongoDB connection closed. App exiting.");
  process.exit(0);
});

startServer();