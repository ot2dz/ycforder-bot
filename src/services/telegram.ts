import { logger } from '../lib/logger.js';
import type { Telegraf } from 'telegraf';
import type { OrderState } from '../bot/types.js';
import { formatOrderMessage, getChannelControlKeyboard, getStatusDisplayText } from '../bot/ui.js';
import { getOrderStatus } from './airtable.js';

/**
 * يرسل تفاصيل الطلب المكتمل إلى القناة المحددة كرسالة واحدة متكاملة.
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

  // إعداد رسالة تفاصيل الطلب
  const orderDetails = formatOrderMessage(state, orderId, false, 'preparing');

  // إعداد مجموعة الصور مع التفاصيل على أول صورة
  const mediaGroup = state.cloudinaryPhotoData.map((photo, index) => ({
    type: 'photo' as const,
    media: photo.secure_url,
    caption: index === 0 ? orderDetails : '', // أضف التفاصيل على أول صورة فقط
    parse_mode: 'Markdown' as const,
  }));

  try {
    // أرسل مجموعة الصور مع تفاصيل الطلب
    const sentMessages = await bot.telegram.sendMediaGroup(channelId, mediaGroup);
    
    // أرسل رسالة أزرار التحكم مباشرة بعد الصور (بدون فاصل)
    const keyboard = getChannelControlKeyboard(orderId, 'preparing');
    await bot.telegram.sendMessage(channelId, `🎛️ **أزرار التحكم بالطلب: ${orderId}**\n🔍 الحالة: قيد التجهيز`, {
        ...keyboard,
        parse_mode: 'Markdown',
    });

    logger.info({ orderId }, 'Successfully posted order with integrated controls to channel.');
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

/**
 * يحذف رسائل الطلب من القناة نهائياً
 * @param bot نسخة Telegraf
 * @param orderId معرف الطلب
 * @param controlMessageId معرف رسالة أزرار التحكم
 */
export async function deleteOrderFromChannel(bot: Telegraf, orderId: string, controlMessageId?: number) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID is not set. Cannot delete channel messages.');
    return;
  }

  logger.info({ orderId, controlMessageId }, 'Deleting order messages from channel...');

  try {
    // 1. أولاً نعدّل رسالة أزرار التحكم لتصبح رسالة حذف
    if (controlMessageId) {
      try {
        await bot.telegram.editMessageText(
          channelId,
          controlMessageId,
          undefined,
          `❌ **تم حذف الطلب: ${orderId}**\n📝 تم حذف هذا الطلب نهائياً من النظام.`,
          {
            parse_mode: 'Markdown'
          }
        );
        logger.info({ orderId, controlMessageId }, 'Successfully updated control message to deletion notice.');
      } catch (editError: any) {
        logger.warn({ editError, orderId, controlMessageId }, 'Failed to edit control message, will try deletion...');
        // إذا فشل التعديل، نحاول الحذف
        try {
          await bot.telegram.deleteMessage(channelId, controlMessageId);
          logger.info({ orderId, controlMessageId }, 'Successfully deleted control message as fallback.');
        } catch (deleteError: any) {
          logger.warn({ deleteError, orderId, controlMessageId }, 'Failed to delete control message as well.');
        }
      }
    }

    // 2. محاولة حذف رسائل الصور والتفاصيل السابقة
    if (controlMessageId) {
      // محاولة حذف رسائل قبل رسالة التحكم (عادة ما تكون صور وتفاصيل الطلب)
      let deletedCount = 0;
      for (let i = 1; i <= 10; i++) { // زيادة المدى لتغطية أكثر من الرسائل
        try {
          const messageToDelete = controlMessageId - i;
          if (messageToDelete > 0) {
            await bot.telegram.deleteMessage(channelId, messageToDelete);
            deletedCount++;
            logger.info({ orderId, deletedMessageId: messageToDelete }, 'Successfully deleted order message.');
            
            // تأخير قصير لتجنب rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (deleteError: any) {
          // عند فشل حذف رسالة، نتوقف (قد تكون وصلنا لرسائل أخرى)
          logger.debug({ deleteError, orderId, messageId: controlMessageId - i }, 'Could not delete message, may not be part of this order');
          // إذا فشلنا في 3 محاولات متتالية، نتوقف
          if (i >= 3 && deletedCount === 0) {
            logger.info('Stopping deletion attempts as no messages were successfully deleted');
            break;
          }
        }
      }
      
      logger.info({ orderId, deletedCount }, `Attempted to delete order messages, deleted ${deletedCount} messages`);
    }

    // 3. إرسال رسالة تأكيد إضافية إذا لم نتمكن من تعديل رسالة التحكم
    if (!controlMessageId) {
      await bot.telegram.sendMessage(channelId, `❌ **تم حذف الطلب: ${orderId}**\n📝 تم حذف هذا الطلب نهائياً من النظام.`, {
        parse_mode: 'Markdown'
      });
    }

    logger.info({ orderId }, 'Successfully processed order deletion from channel.');
  } catch (error) {
    logger.error({ error, orderId }, 'Failed to delete order from channel.');
    throw error;
  }
}