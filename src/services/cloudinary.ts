import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../lib/logger.js';
import type { Telegraf } from 'telegraf';

let isCloudinaryConfigured = false;

function ensureCloudinaryConfigured() {
  if (isCloudinaryConfigured) return;

  if (!process.env.CLOUDINARY_URL) {
    logger.error('CLOUDINARY_URL is not set. Cloudinary service cannot be used.');
    throw new Error('Cloudinary configuration is missing.');
  }
  // تهيئة Cloudinary باستخدام متغير البيئة مباشرة
  cloudinary.config(); // المكتبة تقرأ CLOUDINARY_URL تلقائياً
  isCloudinaryConfigured = true;
  logger.info('Cloudinary service configured successfully.');
}

// نوع البيانات التي تعود بعد الرفع الناجح
export interface CloudinaryUploadResult {
  secure_url: string; // رابط الصورة المباشر (CDN)
  public_id: string; // المعرف الفريد للصورة في Cloudinary
}

/**
 * تأخذ معرف ملف من تيليجرام (file_id)، تحصل على رابط التحميل المؤقت،
 * وترفع الصورة مباشرة إلى Cloudinary.
 * @param bot - نسخة Telegraf للوصول إلى API تيليجرام
 * @param fileId - معرف الملف من تيليجرام
 * @param orderId - معرف الطلب لاستخدامه في تنظيم المجلدات
 * @returns Promise يحتوي على نتيجة الرفع من Cloudinary
 */
async function uploadTelegramFile(
  bot: Telegraf,
  fileId: string,
  orderId: string
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfigured(); // تأكد من أن التهيئة قد تمت

  // 1. احصل على رابط التحميل المؤقت من تيليجرام
  const fileLink = await bot.telegram.getFileLink(fileId);

  // 2. ارفع الصورة إلى Cloudinary باستخدام الرابط مباشرة
  //    هذا أكثر كفاءة من تحميل الملف ثم إعادة رفعه
  logger.debug({ href: fileLink.href, folder: `orders/${orderId}` }, 'Attempting to upload to Cloudinary...');
  const result = await cloudinary.uploader.upload(fileLink.href, {
    folder: `orders/${orderId}`, // تنظيم الصور في مجلدات لكل طلب
    resource_type: 'image',
  });

  // --- التحقق الإضافي ---
  logger.info({ public_id: result.public_id, url: result.secure_url }, 'Cloudinary upload successful.');
  if (!result.public_id || !result.secure_url) {
      logger.error({ result }, 'Cloudinary returned a success status but missing critical data.');
      throw new Error('Invalid response from Cloudinary.');
  }

  return result as CloudinaryUploadResult;
}

/**
 * تأخذ مصفوفة من معرفات الملفات من تيليجرام وترفعها جميعاً إلى Cloudinary بالتوازي.
 * @param bot - نسخة Telegraf
 * @param fileIds - مصفوفة من معرفات الملفات
 * @param orderId - معرف الطلب الحالي
 * @returns مصفوفة من نتائج الرفع
 */
export async function uploadOrderPhotosToCloudinary(
  bot: Telegraf,
  fileIds: string[],
  orderId: string
): Promise<CloudinaryUploadResult[]> {
  ensureCloudinaryConfigured(); // تأكد من أن التهيئة قد تمت

  if (!fileIds || fileIds.length === 0) {
    logger.warn(`No file IDs provided for order '${orderId}'. Skipping Cloudinary upload.`);
    return [];
  }

  logger.info(`Uploading ${fileIds.length} photo(s) for order '${orderId}' to Cloudinary...`);

  const uploadPromises = fileIds.map(fileId =>
    uploadTelegramFile(bot, fileId, orderId)
  );

  const results = await Promise.all(uploadPromises);

  logger.info(`Successfully uploaded ${results.length} photo(s) to Cloudinary for order '${orderId}'.`);
  return results;
}