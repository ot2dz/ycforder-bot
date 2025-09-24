import { logger } from '../lib/logger.ts';
import type { Telegraf } from 'telegraf';
import type { OrderState } from '../bot/types.ts';
import { formatOrderMessage, getChannelControlKeyboard, getStatusDisplayText } from '../bot/ui.ts';
import { getOrderStatus } from './airtable.ts';

/**
 * يرسل تفاصيل الطلب المكتمل إلى القناة المحددة.
 * @param bot نسخة Telegraf
 * @param state بيانات الطلب المكتملة
 * @param orderId المعرف الفريد للطلب
 */
export async function postOrderToChannel(bot: Telegraf, state: OrderState, orderId: string) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID is not set. Cannot post to channel.');
    return;
  }

  if (!state.cloudinaryPhotoData || state.cloudinaryPhotoData.length === 0) {
    logger.error({ orderId }, 'No Cloudinary photos found in state. Cannot post to channel.');
    return;
  }

  logger.info({ orderId, channelId }, 'Posting new order to Telegram channel...');

  // 2. جهز مجموعة الصور (Media Group) مع الحالة
  const fullCaption = formatOrderMessage(state, orderId, false, 'preparing');

  // 2. جهز مجموعة الصور (Media Group)
  const mediaGroup = state.cloudinaryPhotoData.map((photo, index) => ({
    type: 'photo' as const,
    media: photo.secure_url, // استخدم رابط الصورة المباشر من Cloudinary
    caption: index === 0 ? fullCaption : '', // أضف الوصف الكامل على أول صورة فقط
    parse_mode: 'Markdown' as const,
  }));

  try {
    // 3. أرسل مجموعة الصور إلى القناة
    await bot.telegram.sendMediaGroup(channelId, mediaGroup);
    
    // 4. أرسل رسالة منفصلة تحتوي على أزرار التحكم بالحالة الابتدائية
    const keyboard = getChannelControlKeyboard(orderId, 'preparing');
    await bot.telegram.sendMessage(channelId, `*التحكم بالطلب: ${orderId}*`, {
        ...keyboard,
        parse_mode: 'Markdown',
    });

    logger.info({ orderId }, 'Successfully posted order to channel.');
  } catch (error) {
    logger.error({ error, orderId, channelId }, 'Failed to post order to Telegram channel.');
    // ألقِ خطأً لإعلام الدالة المستدعية بالفشل
    throw new Error('Failed to post to channel');
  }
}

/**
 * يحدث رسالة الطلب في القناة عند تغيير الحالة
 * @param bot نسخة Telegraf
 * @param orderId معرف الطلب
 * @param newStatus الحالة الجديدة
 * @param controlMessageId معرف رسالة أزرار التحكم
 */
export async function updateChannelOrderStatus(bot: Telegraf, orderId: string, newStatus: string, controlMessageId?: number) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID is not set. Cannot update channel message.');
    return;
  }

  logger.info({ orderId, newStatus }, 'Updating order status in channel...');

  try {
    // الحصول على الحالة الحالية للطلب
    const currentStatus = await getOrderStatus(orderId);
    if (!currentStatus) {
      throw new Error(`Order ${orderId} not found`);
    }

    // تحديث الأزرار حسب الحالة الجديدة
    const newKeyboard = getChannelControlKeyboard(orderId, currentStatus);
    const statusText = getStatusDisplayText(currentStatus);
    
    const updatedMessage = `*التحكم بالطلب: ${orderId}*\n✨ *الحالة:* ${statusText}`;

    // إذا كان لدينا معرف رسالة التحكم، حدثها
    if (controlMessageId) {
      try {
        await bot.telegram.editMessageText(
          channelId,
          controlMessageId,
          undefined,
          updatedMessage,
          {
            parse_mode: 'Markdown',
            ...newKeyboard
          }
        );
      } catch (editError: any) {
        // إذا كان الخطأ هو "لم يتم تعديل الرسالة"، فهذا يعني أن الرسالة لا تحتاج لتحديث
        if (editError.response?.description?.includes('message is not modified')) {
          logger.info({ orderId, newStatus: currentStatus }, 'Channel message already has the correct status, no update needed');
          return; // لا ترمي خطأ في هذه الحالة
        }
        throw editError; // رمي أي خطأ آخر
      }
    } else {
      // إذا لم يكن لدينا معرف، أرسل رسالة جديدة
      await bot.telegram.sendMessage(channelId, updatedMessage, {
        parse_mode: 'Markdown',
        ...newKeyboard
      });
    }

    logger.info({ orderId, newStatus: currentStatus }, 'Successfully updated order status in channel.');
  } catch (error) {
    logger.error({ error, orderId, newStatus }, 'Failed to update order status in channel.');
    throw error;
  }
}