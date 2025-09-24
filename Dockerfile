# استخدام Node.js 20 كـ base image
FROM node:20-alpine

# تعيين مجلد العمل
WORKDIR /app

# نسخ ملفات package
COPY package*.json ./
COPY pnpm-lock.yaml ./

# تثبيت pnpm عالمياً
RUN npm install -g pnpm

# تثبيت التبعيات
RUN pnpm install

# نسخ بقية الملفات
COPY . .

# بناء المشروع
RUN pnpm run build

# إعداد المتغيرات
ENV NODE_ENV=production
ENV PORT=3000

# كشف المنفذ
EXPOSE 3000

# إنشاء user غير root للأمان
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001
USER botuser

# تشغيل البوت
CMD ["pnpm", "start"]