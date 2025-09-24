# YCF Order Bot 📦

Telegram bot for order management with Airtable integration and Cloudinary photo storage.

## Features ✨

- 🤖 Telegram bot for order creation
- 📊 Airtable database integration
- 🖼️ Cloudinary photo storage
- 📢 Automatic channel posting
- 🔄 Real-time status management
- 🔐 Team-based authorization
- 📱 Arabic language support

## Setup 🚀

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHANNEL_ID` - Channel ID for posting orders
- `AIRTABLE_API_KEY` - Airtable API key
- `AIRTABLE_BASE_ID` - Airtable base ID
- `AIRTABLE_TABLE_NAME` - Table name in Airtable
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `AUTHORIZED_USER_IDS` - Comma-separated user IDs

### 2. Local Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start
```

### 3. Deployment on Coolify

**✅ Nixpacks-Only Setup (Recommended)**

1. **Build Pack**: Choose "**Nixpacks**" (automatic Node.js detection)
2. **Repository**: `https://github.com/ot2dz/ycforder-bot.git`
3. **Branch**: `main`
4. **Port**: `3000`
5. **Environment Variables**: Set all required variables (see below)
6. **Health Check**: `/health`

**Environment Variables to set in Coolify:**
```
NODE_ENV=production
PORT=3000
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHANNEL_ID=your_channel_id_here
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
AIRTABLE_TABLE_NAME=your_table_name
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
AUTHORIZED_USER_IDS=user1,user2,user3
LOG_LEVEL=info
```

⚠️ **Security Note**: Never commit secrets to the repository. Always set them as runtime Environment Variables in Coolify.

## Order Status Flow 🔄

- 🔍 قيد التجهيز (Preparing)
- ✅ تم التجهيز (Prepared)
- 🚚 تم الإرسال (Shipped)
- 📦 تم التسليم (Delivered)
- ❌ تم الإلغاء (Canceled)

## Commands 📝

- `/start` - Start the bot
- `🆕 طلب جديد` - Create new order
- `📦 عرض الطلبات` - View orders (authorized users only)

## Tech Stack 💻

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Package Manager**: pnpm 10.15.0 (pinned)
- **Bot Framework**: Telegraf
- **Database**: Airtable
- **File Storage**: Cloudinary
- **Build Tool**: TypeScript Compiler
- **Deployment**: Coolify with Nixpacks (auto-detection)

## Project Structure 📁

```
src/
├── bot/           # Bot logic and handlers
├── services/      # External service integrations
├── lib/           # Utilities and helpers
└── index.ts       # Main application entry point
```

## Health Check 💚

The bot includes a health check endpoint at `/health` that returns:

```json
{
  "status": "healthy",
  "timestamp": "2024-09-24T..."
}
```

## License 📄

ISC License