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

# تشغيل البوت
CMD ["pnpm", "start"]