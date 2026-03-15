import { Devvit, type FormField, ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { handleNuke, handleNukePost } from "./nuke.js";

// ═══════════════════════════════════════════════════════════════
// ⚙️  CONFIGURATION — CHANGE THESE VALUES
// ═══════════════════════════════════════════════════════════════

// 🔴 CHANGE: Your Slack Webhook URL
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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';

// 🟡 INFO: How many subreddits to process per job run
const BATCH_SIZE = 5;

// 🟡 INFO: Max posts fetched per subreddit per run
const POSTS_PER_SUBREDDIT = 50;

// 🟡 INFO: Slack max message size (safe buffer under 40,000 char limit)
const SLACK_MAX_CHARS = 38000;

// 🟡 INFO: Delay between Slack messages in ms (respects 1 msg/sec limit)
const SLACK_SEND_DELAY_MS = 1100;

// 🟡 INFO: Redis keys
const REDIS_CONFIG_KEY = 'scraper_config';
const REDIS_CURSOR_KEY = 'scraper_cursor';
const REDIS_JOB_ID_KEY = 'scraper_job_id';

// ═══════════════════════════════════════════════════════════════
// 🔑 KEYWORDS — hardcoded, never changes via UI
//    To update keywords, edit this list and redeploy
// ═══════════════════════════════════════════════════════════════
const KEYWORDS = [
  'amazon','amazon india','ajio','flipkart','meesho','nykaa','tira','tira beauty',
  'tata cliq','cliq','ordered','bought','purchased','shopping','delivery','shipping',
  'courier','package','packaging','return','replacement','exchange','refund',
  'cancelled','cancellation','customer care','support','service','review',
  'my experience','is it worth','should i buy','anyone tried','recommendation',
  'feedback','comparison','vs amazon','vs flipkart',
  'late delivery','delayed','never delivered','fake','duplicate','counterfeit',
  'scam','fraud','damaged','broken','defective','poor quality','cheap quality',
  'wrong item','missing item','refund not received','return rejected',
  'bad experience','worst experience','not responding','no response',
  'good experience','great experience','fast delivery','quick delivery',
  'on time delivery','genuine product','original product','good quality',
  'excellent quality','value for money','best price','great discount',
  'smooth return','easy return','helpful support','good customer care',
  'highly recommend','happy with purchase',
];

// ═══════════════════════════════════════════════════════════════
// 📋 DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════

function getDefaultDates(): { fromDate: string; toDate: string } {
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { fromDate: fmt(yesterday), toDate: fmt(today) };
}

const DEFAULT_SUBREDDITS = [
  'amazon','amazonreviews','AmazonFlexDrivers','Flipkart','india',
  'onlineshopping','deals','frugalmalefashion','BuyItForLife','productreviews',
  'SneakersIndia','IndianFashionAddicts','IndianBeautyDeals','DesiBeautyDeals',
  'IndianSkincareAddicts','IndianMakeupAddicts','IndianBeautyBees','indianbeautyhauls',
  'indianbeautyyappers','FuckTira','IsThisAScamIndia','NeverBuyItIndia',
  'BhartiyaReplicaParty','smallbusinessindia','IndianTeenagers','fucknykaa',
  'FuckFlipkart','ticktocktreasures','iPhoneWale','NOTHING','Lootdealsforindia',
  'dealsforindia','IndianGaming','watchesindia','IndiaDealsExchange','Indianbooks',
  'dealsOffersFreebies','LaptopDealsIndia','fuckamazon','amazonprime',
  'Anticonsumption','ShittyIllegalLifeTips','redlighttherapy','mildlyinfuriating',
  'wallstreetbets','Mattress',
];

const DEFAULT_ECOM_SITES = [
  'amazon','flipkart','myntra','meesho','nykaa','ajio','snapdeal','jiomart',
  'tira','tata cliq',
];

// ═══════════════════════════════════════════════════════════════

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true,
});

// ─── TYPES ────────────────────────────────────────────────────
interface ScraperConfig {
  fromDate:   string;
  toDate:     string;
  subreddits: string[];
  ecomSites:  string[];
}

interface MatchedPost {
  Title:       string;
  Body:        string;
  CreatedDate: string;
  Comments:    number;
  Upvotes:     number;
  Subreddit:   string;
  PostID:      string;
  Keyword:     string;
  EcomSite:    string;
  URL:         string;
}

// ═══════════════════════════════════════════════════════════════
// 🗄️  REDIS HELPERS
// ═══════════════════════════════════════════════════════════════

async function loadConfig(context: TriggerContext): Promise<ScraperConfig> {
  try {
    const stored = await context.redis.get(REDIS_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ScraperConfig;
      if (!parsed.ecomSites || parsed.ecomSites.length === 0) {
        parsed.ecomSites = DEFAULT_ECOM_SITES;
      }
      console.log(`📦 Redis config loaded`);
      return parsed;
    }
  } catch (err: any) {
    console.error(`⚠️ Redis config read failed, using defaults: ${err.message}`);
  }
  const { fromDate, toDate } = getDefaultDates();
  console.log(`📦 Using default config`);
  return { fromDate, toDate, subreddits: DEFAULT_SUBREDDITS, ecomSites: DEFAULT_ECOM_SITES };
}

async function saveConfig(config: ScraperConfig, context: TriggerContext): Promise<void> {
  await context.redis.set(REDIS_CONFIG_KEY, JSON.stringify(config));
}

async function loadCursor(context: TriggerContext): Promise<number> {
  try {
    const val = await context.redis.get(REDIS_CURSOR_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function saveCursor(cursor: number, context: TriggerContext): Promise<void> {
  await context.redis.set(REDIS_CURSOR_KEY, String(cursor));
}

// ═══════════════════════════════════════════════════════════════
// ⏰  SCHEDULER HELPERS
// ═══════════════════════════════════════════════════════════════

async function startHourlyJob(context: TriggerContext): Promise<void> {
  const existingJobId = await context.redis.get(REDIS_JOB_ID_KEY);
  if (existingJobId) {
    console.log(`⏰ Hourly scraper already running. Job ID: ${existingJobId}`);
    return;
  }
  const jobId = await context.scheduler.runJob({
    name: 'scrapeAndForward',
    cron: '0 * * * *',
  });
  await context.redis.set(REDIS_JOB_ID_KEY, jobId);
  console.log(`⏰ Hourly scraper started. Job ID: ${jobId}`);
}

async function cancelHourlyJob(context: TriggerContext): Promise<void> {
  try {
    const jobId = await context.redis.get(REDIS_JOB_ID_KEY);
    if (jobId) {
      await context.scheduler.cancelJob(jobId);
      await context.redis.del(REDIS_JOB_ID_KEY);
      console.log(`🛑 Hourly scraper stopped. Job ID: ${jobId}`);
    }
  } catch (err: any) {
    console.error(`⚠️ Failed to cancel job: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 📮 SLACK HELPER
//
// 🔴 FIXED: Dynamic size-based chunking
//    - Calculates how many complete posts fit within SLACK_MAX_CHARS
//    - Posts NEVER break across messages
//    - 1.1s delay between messages to respect Slack rate limit
// ═══════════════════════════════════════════════════════════════

// Send a single chunk of posts to Slack
async function sendChunk(chunk: MatchedPost[]): Promise<void> {
  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: JSON.stringify(chunk, null, 2) }),
    });
    if (!response.ok) {
      console.error(`❌ Slack webhook failed: ${response.status}`);
    } else {
      console.log(`✅ Slack message sent (${chunk.length} posts)`);
    }
  } catch (err: any) {
    console.error(`❌ Slack send error: ${err.message}`);
  }
}

// Sleep helper
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// Main Slack sender — groups posts by size, never breaks a post mid-message
async function sendToSlack(posts: MatchedPost[]): Promise<void> {
  if (posts.length === 0) return;

  let currentChunk: MatchedPost[] = [];
  let currentSize  = 0;
  let messageCount = 0;

  for (const post of posts) {
    const postStr  = JSON.stringify(post);
    const postSize = postStr.length;

    // If adding this post would exceed limit AND chunk has posts → send current chunk first
    if (currentSize + postSize > SLACK_MAX_CHARS && currentChunk.length > 0) {
      await sendChunk(currentChunk);
      messageCount++;
      console.log(`  📨 Message ${messageCount} sent (${currentChunk.length} posts, ${currentSize} chars)`);

      // Wait between messages to respect Slack rate limit
      await sleep(SLACK_SEND_DELAY_MS);

      // Start fresh chunk with current post
      currentChunk = [];
      currentSize  = 0;
    }

    currentChunk.push(post);
    currentSize += postSize;
  }

  // Send any remaining posts
  if (currentChunk.length > 0) {
    await sendChunk(currentChunk);
    messageCount++;
    console.log(`  📨 Message ${messageCount} sent (${currentChunk.length} posts, ${currentSize} chars)`);
  }

  console.log(`📮 Slack done — ${messageCount} message(s) sent for ${posts.length} posts`);
}

// ═══════════════════════════════════════════════════════════════
// 🔄 SCRAPER JOB
// ═══════════════════════════════════════════════════════════════
Devvit.addSchedulerJob({
  name: 'scrapeAndForward',
  onRun: async (_event: ScheduledJobEvent, context: TriggerContext) => {
    console.log('🚀 scrapeAndForward job started');

    const config = await loadConfig(context);
    const { subreddits, ecomSites, fromDate, toDate } = config;
    const keywords = KEYWORDS;

    const startDate = new Date(fromDate);
    const endDate   = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('❌ Invalid date range. Use YYYY-MM-DD format.');
      return;
    }

    const cursor     = await loadCursor(context);
    const totalSubs  = subreddits.length;
    const batchStart = cursor % totalSubs;
    const batchEnd   = Math.min(batchStart + BATCH_SIZE, totalSubs);
    const batch      = subreddits.slice(batchStart, batchEnd);
    const nextCursor = batchEnd >= totalSubs ? 0 : batchEnd;

    console.log(`📅 Date range : ${startDate.toDateString()} → ${endDate.toDateString()}`);
    console.log(`📋 Total subs : ${totalSubs} | Batch: [${batchStart}–${batchEnd - 1}] (${batch.length} subreddits)`);
    console.log(`🔑 Keywords   : ${keywords.length} (hardcoded)`);
    console.log(`🔖 Cursor     : ${cursor} → next: ${nextCursor}`);

    const matchedPosts: MatchedPost[] = [];

    for (const subredditName of batch) {
      console.log(`📂 r/${subredditName}`);
      try {
        const listing = await context.reddit.getNewPosts({
          subredditName,
          limit: POSTS_PER_SUBREDDIT,
        }).all();

        console.log(`  📄 Fetched: ${listing.length} posts`);
        let matched = 0;
        let skipped = 0;

        for (const post of listing) {
          const title     = post.title ?? '';
          const body      = post.body  ?? '';
          const createdAt = post.createdAt ?? new Date(0);

          if (createdAt < startDate || createdAt > endDate) { skipped++; continue; }

          const combinedText   = (title + ' ' + body).toLowerCase();
          const matchedKeyword = keywords.find(kw => combinedText.includes(kw.toLowerCase()));
          if (!matchedKeyword) continue;

          const matchedSite = ecomSites.find(site => combinedText.includes(site.toLowerCase()));
          if (!matchedSite) continue;

          matchedPosts.push({
            Title:       title,
            Body:        body,
            CreatedDate: createdAt.toISOString(),
            Comments:    post.numberOfComments ?? 0,
            Upvotes:     post.score ?? 0,
            Subreddit:   post.subredditName ?? subredditName,
            PostID:      post.id,
            Keyword:     matchedKeyword,
            EcomSite:    matchedSite,
            URL:         `https://www.reddit.com/r/${subredditName}/comments/${post.id}`,
          });
          matched++;
        }
        console.log(`  ✅ Matched: ${matched} | Date-skipped: ${skipped}`);
      } catch (err: any) {
        console.error(`  ❌ Failed r/${subredditName}: ${err.message}`);
      }
    }

    await saveCursor(nextCursor, context);

    if (nextCursor === 0) {
      console.log('🏁 Full cycle complete! All subreddits processed.');
      console.log('🛑 Stopping hourly job — will restart at midnight.');
      await cancelHourlyJob(context);
    } else {
      console.log(`🔖 Cursor saved: ${nextCursor}`);
    }

    console.log(`📦 Total matched posts: ${matchedPosts.length}`);
    if (matchedPosts.length === 0) { console.log('⚠️ No matches found this batch.'); return; }

    matchedPosts.sort((a, b) =>
      new Date(b.CreatedDate).getTime() - new Date(a.CreatedDate).getTime()
    );

    await sendToSlack(matchedPosts);
    console.log('🏁 Job complete.');
  },
});

// ═══════════════════════════════════════════════════════════════
// 🌅 DAILY RESTART JOB
// ═══════════════════════════════════════════════════════════════
Devvit.addSchedulerJob({
  name: 'dailyRestart',
  onRun: async (_event: ScheduledJobEvent, context: TriggerContext) => {
    console.log('🌅 Daily restart triggered — starting fresh hourly cycle');
    await saveCursor(0, context);

    const stored = await context.redis.get(REDIS_CONFIG_KEY);
    if (!stored) {
      console.log('📅 No custom config — default dates will be used');
    } else {
      const config = JSON.parse(stored) as ScraperConfig;
      const { fromDate, toDate } = getDefaultDates();
      config.fromDate = fromDate;
      config.toDate   = toDate;
      await saveConfig(config, context);
      console.log(`📅 Dates auto-updated: ${fromDate} → ${toDate}`);
    }

    await cancelHourlyJob(context);
    await startHourlyJob(context);
  },
});

// ─── ON INSTALL ───────────────────────────────────────────────
Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'dailyRestart',
      cron: '0 0 * * *',
    });
    console.log('📅 App installed — daily midnight restart scheduled.');
    await startHourlyJob(context);
  },
});

// ─── ON UPGRADE — do nothing ─────────────────────────────────
Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (_event, _context) => {
    console.log('🔄 App upgraded — scraper continues running unchanged.');
  },
});

// ─── MANUAL TRIGGERS ─────────────────────────────────────────
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

Devvit.addMenuItem({
  label: '▶️ Start Hourly Scraper',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_, context) => {
    await startHourlyJob(context);
    context.ui.showToast('✅ Hourly scraper started!');
  },
});

Devvit.addMenuItem({
  label: '⏹️ Stop Hourly Scraper',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_, context) => {
    await cancelHourlyJob(context);
    context.ui.showToast('🛑 Hourly scraper stopped.');
  },
});

// ═══════════════════════════════════════════════════════════════
// ⚙️  FORM 1 — Update Dates & Ecom Sites
// ═══════════════════════════════════════════════════════════════
const updateDatesForm = Devvit.createForm(
  () => {
    const { fromDate, toDate } = getDefaultDates();
    return {
      title:       'Update Dates & Ecom Sites',
      acceptLabel: 'Save',
      cancelLabel: 'Cancel',
      fields: [
        {
          name:         'fromDate',
          label:        'From Date (YYYY-MM-DD)',
          type:         'string',
          defaultValue: fromDate,
        },
        {
          name:         'toDate',
          label:        'To Date (YYYY-MM-DD)',
          type:         'string',
          defaultValue: toDate,
        },
        {
          name:         'ecomSites',
          label:        'Ecom Sites (comma separated)',
          type:         'string',
          defaultValue: DEFAULT_ECOM_SITES.join(','),
        },
      ] as FormField[],
    };
  },
  async ({ values }, context) => {
    const fromDate  = (values.fromDate  as string)?.trim();
    const toDate    = (values.toDate    as string)?.trim();
    const ecomSites = (values.ecomSites as string).split(',').map((s: string) => s.trim()).filter(Boolean);

    if (isNaN(new Date(fromDate).getTime()) || isNaN(new Date(toDate).getTime())) {
      context.ui.showToast('❌ Invalid dates. Use YYYY-MM-DD format.');
      return;
    }
    if (ecomSites.length === 0) { context.ui.showToast('❌ At least one ecom site required.'); return; }

    const existing = await loadConfig(context);
    await saveConfig({ ...existing, fromDate, toDate, ecomSites }, context);
    await saveCursor(0, context);
    await cancelHourlyJob(context);
    await startHourlyJob(context);

    console.log(`✅ Dates updated — ${fromDate} → ${toDate} | EcomSites: ${ecomSites.length}`);
    context.ui.showToast(`✅ Saved! ${fromDate} → ${toDate}. Scraper restarted.`);
  }
);

// ═══════════════════════════════════════════════════════════════
// ⚙️  FORM 2 — Update Subreddits
// ═══════════════════════════════════════════════════════════════
const updateSubredditsForm = Devvit.createForm(
  () => ({
    title:       'Update Subreddits',
    acceptLabel: 'Save',
    cancelLabel: 'Cancel',
    fields: [
      {
        name:         'subreddits',
        label:        'Subreddits (comma separated)',
        type:         'string',
        defaultValue: DEFAULT_SUBREDDITS.join(','),
      },
    ] as FormField[],
  }),
  async ({ values }, context) => {
    const subreddits = (values.subreddits as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (subreddits.length === 0) { context.ui.showToast('❌ At least one subreddit required.'); return; }

    const existing = await loadConfig(context);
    await saveConfig({ ...existing, subreddits }, context);
    await saveCursor(0, context);
    await cancelHourlyJob(context);
    await startHourlyJob(context);

    console.log(`✅ Subreddits updated — ${subreddits.length} subreddits`);
    context.ui.showToast(`✅ Saved! ${subreddits.length} subreddits. Scraper restarted.`);
  }
);

Devvit.addMenuItem({
  label:       '📅 Update Dates & Ecom Sites',
  location:    'subreddit',
  forUserType: 'moderator',
  onPress:     (_, context) => context.ui.showForm(updateDatesForm),
});

Devvit.addMenuItem({
  label:       '📋 Update Subreddits',
  location:    'subreddit',
  forUserType: 'moderator',
  onPress:     (_, context) => context.ui.showForm(updateSubredditsForm),
});

Devvit.addMenuItem({
  label:       '🔄 Reset Config to Defaults',
  location:    'subreddit',
  forUserType: 'moderator',
  onPress: async (_, context) => {
    await context.redis.del(REDIS_CONFIG_KEY);
    await context.redis.del(REDIS_CURSOR_KEY);
    await cancelHourlyJob(context);
    context.ui.showToast('✅ Config, cursor and scraper reset to defaults.');
  },
});

// ─── EXISTING COMMENT MOP LOGIC (UNCHANGED) ──────────────────
const nukeFields: FormField[] = [
  { name: "remove",            label: "Remove comments",            type: "boolean", defaultValue: true  },
  { name: "lock",              label: "Lock comments",              type: "boolean", defaultValue: false },
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