# City Cost ETL Scraper Pipeline

This directory contains the `city-cost-scraper.ts` script, which automates the extraction of minimum food and hotel costs from third-party APIs (Yelp & Amadeus) and saves them into the local MongoDB instance. This data is used to ground the AI Trip Generation agent with realistic floor prices for different destinations.

## 1. Environment Setup

Before you can run the scraper manually, you must define the following secrets in your `backend/.env` file:

```env
MONGO_URI=mongodb://localhost:27017/travelplan  # Or your MongoDB Atlas connection string
YELP_API_KEY=your_yelp_fusion_api_key_here
AMADEUS_API_KEY=your_amadeus_api_key_here
AMADEUS_API_SECRET=your_amadeus_api_secret_here
```

_Note: For production, these exact same variable names must be configured as Repository Secrets in GitHub Actions._

## 2. Running the Scraper Manually (Dry Run / QA)

To test the extraction logic and verify the script connects to the external APIs successfully, run the script directly via `tsx`.

1. Open your terminal.
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Execute the script:
   ```bash
   npx tsx scripts/city-cost-scraper.ts
   ```

**Expected Output:**
You should see terminal logs indicating the progress of the scraper as it connects to MongoDB, iterates through the target cities (VN, FR, US), fetches data, and saves trimmed averages:

```text
🚀 Starting City Budget ETL Pipeline...
✅ Connected to MongoDB.

--- Processing Hanoi (VN) ---
[YELP] Scraping food for Hanoi, VN...
[YELP] Found 50 valid cheap eats in Hanoi. Avg base ~$2
[AMADEUS] Scraping hotels for HAN...
[AMADEUS] Fetching new access token...
[AMADEUS] Found 5 priced offers in HAN. Trimmed Avg: $18.50
💾 Saved to DB: hanoi_vn -> Food: $2, Hotel: $19

...
✅ ETL Pipeline Completed Successfully.
```

## 3. Database Verification

To verify that the data was actually loaded/updated in the database correctly, you can query MongoDB directly.

**Option A: Using MongoDB Compass (UI)**

1. Open MongoDB Compass and connect to your database (e.g., `mongodb://localhost:27017`).
2. Open the `travelplan` database (or whatever your db name is).
3. Open the `citycosts` collection.
4. You should see documents mirroring the data, for example:
   ```json
   {
     "_id": ObjectId("..."),
     "cityId": "nyc_us",
     "cityName": "New York City",
     "country": "US",
     "minFoodUSD": 12,
     "minHotelUSD": 327,
     "lastUpdated": 2024-03-01T02:00:00.000Z
   }
   ```

**Option B: Using Node.js (Terminal)**
Run this quick diagnostic script from the `backend/` directory to print the database contents directly to your terminal:

```bash
node -e "require('dotenv').config(); const mongoose = require('mongoose'); mongoose.connect(process.env.MONGO_URI).then(() => { mongoose.connection.db.collection('citycosts').find({}).toArray().then(res => { console.dir(res, { depth: null }); process.exit(0); }); });"
```

## 4. End-to-End Core Verification

To test that this actually works in the main application flow:

1. Ensure the `city-cost-scraper.ts` has successfully run at least once and populated the database.
2. Start the main application (`npm run dev` in frontend, `docker-compose up` / backend running).
3. Go to the web UI and create a new trip to one of the target cities (e.g., "Paris").
4. Watch the backend logs. You should see a line confirming the system found the base costs before calling the AI:
   ```text
   INFO: 💰 Found Base Costs for destination {"cityId":"paris_fr","minFoodUSD":8,"minHotelUSD":150}
   ```
5. Wait for the generated trip itinerary. The AI should generate its recommendations respecting the baseline costs passed in the prompt context.

## 5. Idempotency index migration (`migrate-idempotency-index.ts`)

`IdempotencyLog` used to be unique on `key` alone, so one user's `X-Idempotency-Key` could block another user's write. The model is now unique on `{userId, key}`. The new API revision builds that index on boot; the old key-only index (`key_1`) is **only** removed by this script.

The script is idempotent: it creates `{userId, key}` (unique) if missing, then drops the key-only index if present. Uniqueness is never absent, so it is safe while old and new API revisions overlap. Re-running prints "nothing to do".

Order of rollout — staging first, then production:

1. Deploy the new API revision to the environment. Both indexes may exist while old and new revisions overlap; that is fine.
2. Once the old revision is no longer serving traffic, run the script against that environment (PowerShell, from the repo root):
   ```powershell
   $env:MONGO_URI = "<that environment's connection string>"
   npm run migrate:idempotency-index --workspace=backend
   ```
   Expected output: `Connected to database "<name>".`, then `Created unique index {userId, key}.` (or `already present`), then `Dropped legacy key-only unique index.` (or `nothing to do`).
3. Verify: in `mongosh`, `db.idempotencylogs.getIndexes()` shows `userId_1_key_1` (unique) and no `key_1`.
4. Production only after staging has run clean for a trip create with the same key from two accounts. Clear `MONGO_URI` from the shell afterwards.

If an old revision boots after the script ran, Mongoose may recreate `key_1`; re-run the script once that revision is gone.
