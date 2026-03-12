import { Devvit, type FormField, ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { handleNuke, handleNukePost } from "./nuke.js";

// ─── CONFIG ───────────────────────────────────────────────────

const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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';

// 🟡 INFO: Redis key where dynamic config is stored
const REDIS_CONFIG_KEY = 'scraper_config';

// ═══════════════════════════════════════════════════════════════
// 📋 DEFAULT CONFIG — used when no Redis override is set
//    Use "⚙️ Update Scraper Config" menu to change dynamically
// ═══════════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  fromDate: '2025-03-01',
  toDate: '2025-03-13',
  subreddits: [
    'amazon',
    'amazonreviews',
    'AmazonFlexDrivers',
    'Flipkart',
    'india',
    'onlineshopping',
    'deals',
    'frugalmalefashion',
    'BuyItForLife',
    'productreviews',
  ],
  keywords: [
    'delivery',
    'refund',
    'late',
    'scam',
    'quality',
    'broken',
    'replacement',
    'return',
    'customer service',
    'discount',
  ],
};

const POSTS_PER_SUBREDDIT = 25;

// ─────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true, // 🔴 ADDED: needed for Redis config storage
});

// ─── TYPES ────────────────────────────────────────────────────
interface ScraperConfig {
  fromDate: string;
  toDate: string;
  subreddits: string[];
  keywords: string[];
}

// ─── REDIS: Load config (falls back to DEFAULT_CONFIG) ────────
async function loadConfig(context: TriggerContext): Promise<ScraperConfig> {
  try {
    const stored = await context.redis.get(REDIS_CONFIG_KEY);
    if (stored) {
      console.log('📦 Using Redis config');
      return JSON.parse(stored) as ScraperConfig;
    }
  } catch (err: any) {
    console.error(`⚠️ Redis read failed, using defaults: ${err.message}`);
  }
  console.log('📦 Using default config');
  return DEFAULT_CONFIG;
}

// ─── REDIS: Save config ───────────────────────────────────────
async function saveConfig(config: ScraperConfig, context: TriggerContext): Promise<void> {
  await context.redis.set(REDIS_CONFIG_KEY, JSON.stringify(config));
}

// ─── HELPER: Send posts to Slack in chunks ────────────────────
async function sendToSlack(posts: object[]): Promise<void> {
  const chunkSize = 10;

  for (let i = 0; i < posts.length; i += chunkSize) {
    const chunk = posts.slice(i, i + chunkSize);

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: JSON.stringify(chunk, null, 2) }),
      });

      if (!response.ok) {
        console.error(`❌ Slack webhook failed: ${response.status}`);
      } else {
        console.log(`✅ Sent chunk ${Math.floor(i / chunkSize) + 1}`);
      }

      await new Promise(r => setTimeout(r, 1000));

    } catch (err: any) {
      console.error(`❌ Slack send error: ${err.message}`);
    }
  }
}

// ─── SCRAPER JOB ─────────────────────────────────────────────
Devvit.addSchedulerJob({
  name: 'scrapeAndForward',
  onRun: async (_event: ScheduledJobEvent, context: TriggerContext) => {
    console.log('🚀 scrapeAndForward job started');

    // Load config — Redis override or defaults
    const config = await loadConfig(context);
    const { subreddits, keywords, fromDate, toDate } = config;

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('❌ Invalid date range in config. Use YYYY-MM-DD format.');
      return;
    }

    console.log(`📅 Date range: ${startDate.toDateString()} → ${endDate.toDateString()}`);
    console.log(`📋 Subreddits: ${subreddits.length} | Keywords: ${keywords.length}`);

    const matchedPosts: object[] = [];

    for (const subredditName of subreddits) {
      console.log(`📂 Fetching from r/${subredditName}`);

      try {
        const listing = await context.reddit.getHotPosts({
          subredditName,
          limit: POSTS_PER_SUBREDDIT,
        }).all();

        console.log(`  ✅ Got ${listing.length} posts`);

        for (const post of listing) {
          const title = post.title ?? '';
          const body = post.body ?? '';
          const createdAt: Date = post.createdAt ?? new Date(0);

          // Date range filter
          if (createdAt < startDate || createdAt > endDate) continue;

          const combinedText = (title + ' ' + body).toLowerCase();
          const matchedKeyword = keywords.find(keyword =>
            combinedText.includes(keyword.toLowerCase())
          );

          if (!matchedKeyword) continue;

          matchedPosts.push({
            Title: title,
            Body: body,
            CreatedDate: post.createdAt?.toISOString?.() ?? '',
            Comments: post.numberOfComments ?? 0,
            Upvotes: post.score ?? 0,
            Subreddit: post.subredditName ?? subredditName,
            PostID: post.id,
            Keyword: matchedKeyword,
          });
        }

        await new Promise(r => setTimeout(r, 1000));

      } catch (err: any) {
        console.error(`❌ Failed for r/${subredditName}: ${err.message}`);
      }
    }

    console.log(`📦 Matched posts: ${matchedPosts.length}`);

    if (matchedPosts.length === 0) {
      console.log('⚠️ No keyword matches found.');
      return;
    }

    // Sort newest → oldest
    matchedPosts.sort((a: any, b: any) =>
      new Date(b.CreatedDate).getTime() - new Date(a.CreatedDate).getTime()
    );

    await sendToSlack(matchedPosts);
    console.log('🏁 Job complete.');
  },
});

// ─── SCHEDULE JOB ON INSTALL ──────────────────────────────────
Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'scrapeAndForward',
      cron: '0 * * * *', // every hour
    });
    console.log('⏰ Hourly scraper scheduled.');
  },
});

// ─── MANUAL TRIGGER ──────────────────────────────────────────
Devvit.addMenuItem({
  label: '🔍 Run Reddit Scraper Now',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'scrapeAndForward',
      runAt: new Date(Date.now() + 1000),
    });
    context.ui.showToast('✅ Scraper triggered! Check logs.');
  },
});

// ═══════════════════════════════════════════════════════════════
// ⚙️  UPDATE CONFIG FORM — change dates/subreddits/keywords
//     without redeploying
// ═══════════════════════════════════════════════════════════════
const updateConfigForm = Devvit.createForm(
  () => ({
    title: 'Update Scraper Config',
    acceptLabel: 'Save Config',
    cancelLabel: 'Cancel',
    fields: [
      {
        name: 'fromDate',
        label: 'From Date (YYYY-MM-DD)',
        type: 'string',
        defaultValue: DEFAULT_CONFIG.fromDate,
      },
      {
        name: 'toDate',
        label: 'To Date (YYYY-MM-DD)',
        type: 'string',
        defaultValue: DEFAULT_CONFIG.toDate,
      },
      {
        name: 'subreddits',
        label: 'Subreddits (comma separated)',
        type: 'string',
        defaultValue: DEFAULT_CONFIG.subreddits.join(','),
      },
      {
        name: 'keywords',
        label: 'Keywords (comma separated)',
        type: 'string',
        defaultValue: DEFAULT_CONFIG.keywords.join(','),
      },
    ] as FormField[],
  }),
  async ({ values }, context) => {
    const fromDate = (values.fromDate as string)?.trim();
    const toDate = (values.toDate as string)?.trim();
    const subreddits = (values.subreddits as string)
      .split(',').map((s: string) => s.trim()).filter(Boolean);
    const keywords = (values.keywords as string)
      .split(',').map((k: string) => k.trim()).filter(Boolean);

    if (isNaN(new Date(fromDate).getTime()) || isNaN(new Date(toDate).getTime())) {
      context.ui.showToast('❌ Invalid dates. Use YYYY-MM-DD format.');
      return;
    }
    if (subreddits.length === 0) {
      context.ui.showToast('❌ At least one subreddit is required.');
      return;
    }
    if (keywords.length === 0) {
      context.ui.showToast('❌ At least one keyword is required.');
      return;
    }

    await saveConfig({ fromDate, toDate, subreddits, keywords }, context);
    console.log(`✅ Config updated — ${fromDate} → ${toDate} | Subreddits: ${subreddits.length} | Keywords: ${keywords.length}`);
    context.ui.showToast(`✅ Config saved! ${subreddits.length} subreddits, ${keywords.length} keywords, ${fromDate} → ${toDate}`);
  }
);

Devvit.addMenuItem({
  label: '⚙️ Update Scraper Config',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: (_, context) => context.ui.showForm(updateConfigForm),
});

Devvit.addMenuItem({
  label: '🔄 Reset Config to Defaults',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_, context) => {
    await context.redis.del(REDIS_CONFIG_KEY);
    context.ui.showToast('✅ Config reset to defaults.');
  },
});

// ─── EXISTING COMMENT MOP LOGIC (UNCHANGED) ──────────────────
const nukeFields: FormField[] = [
  { name: "remove", label: "Remove comments", type: "boolean", defaultValue: true },
  { name: "lock", label: "Lock comments", type: "boolean", defaultValue: false },
  { name: "skipDistinguished", label: "Skip distinguished comments", type: "boolean", defaultValue: false },
] as const;

const nukeForm = Devvit.createForm(
  () => ({ fields: nukeFields, title: "Mop Comments", acceptLabel: "Mop", cancelLabel: "Cancel" }),
  async ({ values }, context) => {
    if (!values.lock && !values.remove) { context.ui.showToast("You must select either lock or remove."); return; }
    if (context.commentId) {
      const result = await handleNuke({ remove: values.remove, lock: values.lock, skipDistinguished: values.skipDistinguished, commentId: context.commentId, subredditId: context.subredditId }, context);
      context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
    } else {
      context.ui.showToast(`Mop failed! Please try again later.`);
    }
  }
);

Devvit.addMenuItem({ label: "Mop comments", location: "comment", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukeForm); } });

const nukePostForm = Devvit.createForm(
  () => ({ fields: nukeFields, title: "Mop Post Comments", acceptLabel: "Mop", cancelLabel: "Cancel" }),
  async ({ values }, context) => {
    if (!values.lock && !values.remove) { context.ui.showToast("You must select either lock or remove."); return; }
    if (!context.postId) { throw new Error("No post ID"); }
    const result = await handleNukePost({ remove: values.remove, lock: values.lock, skipDistinguished: values.skipDistinguished, postId: context.postId, subredditId: context.subredditId }, context);
    context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
  }
);

Devvit.addMenuItem({ label: "Mop post comments", location: "post", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukePostForm); } });

export default Devvit;