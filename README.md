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

1. **Build Pack**: Choose "Nixpacks"
2. **Repository**: `https://github.com/ot2dz/ycforder-bot.git`
3. **Branch**: `main`
4. **Port**: `3000`
5. **Environment Variables**: Set all required variables
6. **Health Check**: `/health`

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
- **Bot Framework**: Telegraf
- **Database**: Airtable
- **File Storage**: Cloudinary
- **Package Manager**: pnpm
- **Build Tool**: TypeScript Compiler
- **Deployment**: Coolify with Nixpacks

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