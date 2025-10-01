import type { Context } from 'telegraf';
import type { Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import { logger } from '../lib/logger.js';
import { userStates, type OrderState } from './types.js';
import {
  L,
  formatReviewMessage,
  getMainMenuKeyboard,
  getOptionalStepKeyboard,
  getReviewKeyboard,
  getWizardNavKeyboard,
  getWilayasKeyboard,
  removeKeyboard
} from './ui.js';
import { isValidAmount, isValidPhoneNumber } from './validation.js';
import { uploadOrderPhotosToCloudinary } from '../services/cloudinary.js';
import { postOrderToChannel } from '../services/telegram.js';
import { saveOrderToAirtable, generateOrderId } from '../services/airtable.js';

const MAX_PHOTOS = 10;
type InlineKeyboardMarkup = ReturnType<typeof Markup.inlineKeyboard>;

function ensureChatId(ctx: Context): number | undefined {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    logger.warn('Cannot proceed without chat id.');
    return undefined;
  }
  return chatId;
}

async function deleteMessageIfPossible(ctx: Context, messageId?: number) {
  const chatId = ensureChatId(ctx);
  if (!chatId || !messageId) return;
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (error) {
    logger.warn({ error, messageId }, 'Failed to delete message (possibly already deleted).');
  }
}

async function cleanupReviewArtifacts(ctx: Context, state: OrderState) {
  const chatId = ensureChatId(ctx);
  if (!chatId) return;
  if (state.reviewMediaMessageIds && state.reviewMediaMessageIds.length > 0) {
    for (const mediaMessageId of state.reviewMediaMessageIds) {
      await deleteMessageIfPossible(ctx, mediaMessageId);
    }
    state.reviewMediaMessageIds = undefined;
  }
}

async function editWizardMessage(
  ctx: Context,
  state: OrderState,
  text: string,
  keyboard: InlineKeyboardMarkup = Markup.inlineKeyboard([])
) {
  const chatId = ensureChatId(ctx);
  if (!chatId) return;

  const extra = { parse_mode: 'Markdown', ...keyboard } as const;

  if (state.lastMessageId) {
    try {
      await ctx.telegram.editMessageText(chatId, state.lastMessageId, undefined, text, extra);
      return;
    } catch (error) {
      logger.warn({ error }, 'Failed to edit wizard message, sending a new one.');
    }
  }

  const sentMessage = await ctx.reply(text, extra);
  state.lastMessageId = sentMessage.message_id;
}

async function resetToPromptState(ctx: Context, state: OrderState) {
  if (state.step === 'reviewing' || (state.reviewMediaMessageIds && state.reviewMediaMessageIds.length > 0)) {
    await cleanupReviewArtifacts(ctx, state);
    if (state.lastMessageId) {
      await deleteMessageIfPossible(ctx, state.lastMessageId);
      state.lastMessageId = undefined;
    }
  }
}

async function transitionToStep(
  ctx: Context,
  state: OrderState,
  step: OrderState['step'],
  text: string,
  keyboard: InlineKeyboardMarkup = getWizardNavKeyboard()
) {
  state.step = step;
  await editWizardMessage(ctx, state, text, keyboard);
}

export async function startWizard(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) {
    logger.warn('Received start wizard request without user id.');
    return;
  }

  const existingState = userStates.get(userId);
  if (existingState) {
    await cleanupReviewArtifacts(ctx, existingState);
    await deleteMessageIfPossible(ctx, existingState.lastMessageId);
    userStates.delete(userId);
  }

  logger.info({ userId }, 'Starting new order wizard.');

  const message = await ctx.reply(L.wizardSendPhotos, { parse_mode: 'Markdown', ...getWizardNavKeyboard(), ...removeKeyboard() });
  userStates.set(userId, {
    step: 'awaiting_photos',
    telegramFileIds: [],
    paymentMethod: 'COD',
    lastMessageId: message.message_id
  });
}

export async function promptForCustomerName(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_customer_name', `${L.photosReceived}\n\n${L.askCustomerName}`);
}

export async function promptForPhone(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_phone', L.askPhone);
}

export async function promptForStateCommune(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_state_commune', L.askStateCommune, getWilayasKeyboard());
}

export async function promptForAddress(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_address', L.askAddress, getOptionalStepKeyboard());
}

export async function promptForAmount(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_amount_total', L.askAmount);
}

export async function promptForNotes(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_notes', L.askNotes, getOptionalStepKeyboard());
}

export async function showReview(ctx: Context, state: OrderState) {
  await cleanupReviewArtifacts(ctx, state);
  if (state.lastMessageId) {
    await deleteMessageIfPossible(ctx, state.lastMessageId);
    state.lastMessageId = undefined;
  }

  state.step = 'reviewing';

  const chatId = ensureChatId(ctx);
  if (!chatId) return;

  const escapedCaption = formatReviewMessage(state);
  const mediaGroup = state.telegramFileIds.slice(0, MAX_PHOTOS).map((fileId, index) => ({
    type: 'photo' as const,
    media: fileId,
    caption: index === 0 ? escapedCaption : undefined,
    parse_mode: index === 0 ? ('Markdown' as const) : undefined
  }));

  try {
    const sentMediaMessages = await ctx.replyWithMediaGroup(mediaGroup);
    state.reviewMediaMessageIds = sentMediaMessages.map(message => message.message_id);
  } catch (error) {
    logger.error({ error }, 'Failed to send review media group.');
  }

  const summaryMessage = await ctx.reply('هل تريد تأكيد هذا الطلب؟', getReviewKeyboard());
  state.lastMessageId = summaryMessage.message_id;
}

export async function handleCancel(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (state) {
    await cleanupReviewArtifacts(ctx, state);
    await deleteMessageIfPossible(ctx, state.lastMessageId);
    state.lastMessageId = undefined;
  }
  userStates.delete(userId);
  await ctx.reply(L.orderCanceled, getMainMenuKeyboard());
}

export async function handleConfirm(bot: Telegraf, ctx: Context, state: OrderState) {
  if (state.step === 'submitting') {
    logger.warn({ userId: ctx.from?.id }, 'Duplicate order confirmation tapped.');
    await ctx.answerCbQuery('الطلب قيد المعالجة بالفعل...');
    return;
  }

  state.step = 'submitting';
  await cleanupReviewArtifacts(ctx, state);
  await deleteMessageIfPossible(ctx, state.lastMessageId);
  state.lastMessageId = undefined;

  const processingMessage = await ctx.reply(L.processingOrder, removeKeyboard());

  logger.info({ userId: ctx.from?.id, order: { ...state, telegramFileIds: state.telegramFileIds.length } }, 'Submitting order to external services.');

  try {
    // الخطوة 1: إنشاء معرف طلب بالتسلسل الجديد
    const orderId = await generateOrderId();
    
    // الخطوة 2: ارفع الصور إلى Cloudinary
    const cloudinaryResults = await uploadOrderPhotosToCloudinary(bot, state.telegramFileIds, orderId);
    state.cloudinaryPhotoData = cloudinaryResults; // تخزين البيانات للخطوات التالية

    // الخطوة 3: أرسل إلى القناة
    await postOrderToChannel(bot, state, orderId);

    // الخطوة 4: احفظ في Airtable
    await saveOrderToAirtable(state, orderId);

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Failed to process order submission.');

    // 1. احذف رسالة "جارِ المعالجة..."
    await deleteMessageIfPossible(ctx, processingMessage.message_id);

    // 2. أعد الحالة إلى "المراجعة" للسماح بمحاولة أخرى
    state.step = 'reviewing';

    // 3. أبلغ المستخدم بالخطأ واطلب منه المحاولة مرة أخرى
    await ctx.reply('⚠️ حدث خطأ أثناء تأكيد الطلب. يرجى مراجعة البيانات والمحاولة مرة أخرى بالضغط على زر التأكيد مجدداً.');
    
    // 4. أعد عرض شاشة المراجعة الكاملة (الصور + التفاصيل + الأزرار)
    await showReview(ctx, state);
    return;
  }

  await deleteMessageIfPossible(ctx, processingMessage.message_id);
  await ctx.reply(L.orderConfirmed, getMainMenuKeyboard());
  userStates.delete(ctx.from!.id);
}

export async function handleTextInput(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (!state) return;

  const text = (ctx.message as { text?: string }).text?.trim();
  if (!text) return;

  switch (state.step) {
    case 'awaiting_customer_name':
      state.customerName = text;
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForPhone(ctx, state);
      }
      break;
    case 'awaiting_phone':
      if (!isValidPhoneNumber(text)) {
        await editWizardMessage(ctx, state, L.invalidPhone, getWizardNavKeyboard());
        return;
      }
      state.phone = text;
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForStateCommune(ctx, state);
      }
      break;
    // تم إزالة حالة 'awaiting_state_commune' من هنا لأنها الآن عبر الأزرار
    case 'awaiting_address':
      state.address = text;
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForAmount(ctx, state);
      }
      break;
    case 'awaiting_amount_total':
      if (!isValidAmount(text)) {
        await editWizardMessage(ctx, state, L.invalidAmount, getWizardNavKeyboard());
        return;
      }
      state.amountTotal = Number(text.replace(/\s+/g, ''));
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForNotes(ctx, state);
      }
      break;
    case 'awaiting_notes':
      state.notes = text;
      if (state.isEditing) {
        state.isEditing = false;
      }
      await showReview(ctx, state); // دائماً نذهب للمراجعة بعد الملاحظات
      break;
    case 'awaiting_payment_amount':
      // معالجة إدخال مبلغ الدفعة من الموزع
      if (!isValidAmount(text)) {
        await ctx.reply('⚠️ المبلغ غير صالح. يرجى إدخال أرقام فقط:');
        return;
      }
      
      const amount = Number(text.replace(/\s+/g, ''));
      const wilaya = state.wilayaForPayment!;
      
      try {
        await ctx.reply('⏳ جارِ حفظ المدفوعة...');
        
        // حفظ عملية الدفع في قاعدة البيانات
        const { recordDistributorPayment } = await import('../services/airtable.js');
        await recordDistributorPayment(wilaya, amount, `تم التسجيل عبر البوت`);
        
        await ctx.reply(
          `✅ **تم تسجيل المدفوعة بنجاح!**\n\n` +
          `📍 البلد: ${wilaya}\n` +
          `💰 المبلغ: ${amount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
          `📅 التاريخ: ${new Date().toLocaleDateString('ar-DZ')}`,
          { parse_mode: 'Markdown' }
        );
        
        // العودة إلى إحصائيات البلد المحدثة
        const { getOrderStatisticsByWilaya, getTotalReceivedFromDistributor } = await import('../services/airtable.js');
        const { getStatisticsActionsKeyboard, formatWilayaStatisticsReport } = await import('./ui.js');
        
        const stats = await getOrderStatisticsByWilaya(wilaya);
        const totalReceived = await getTotalReceivedFromDistributor(wilaya);
        const updatedReport = formatWilayaStatisticsReport(wilaya, stats, totalReceived);
        
        await ctx.reply(updatedReport, {
          parse_mode: 'Markdown',
          ...getStatisticsActionsKeyboard(wilaya)
        });
        
      } catch (error) {
        logger.error({ error, wilaya, amount }, 'Failed to record distributor payment');
        await ctx.reply('❌ حدث خطأ أثناء حفظ المدفوعة. يرجى المحاولة مرة أخرى.');
      } finally {
        // تنظيف حالة المستخدم
        userStates.delete(userId);
      }
      break;
    case 'awaiting_payment_edit':
      // معالجة تعديل مبلغ دفعة موجودة
      if (!isValidAmount(text)) {
        await ctx.reply('⚠️ المبلغ غير صالح. يرجى إدخال أرقام فقط:');
        return;
      }
      
      const newAmount = Number(text.replace(/\s+/g, ''));
      const paymentId = state.paymentIdForEdit!;
      const wilayaEdit = state.wilayaForPayment!;
      
      try {
        await ctx.reply('⏳ جارِ تحديث المدفوعة...');
        
        // تحديث مبلغ الدفعة
        const { updatePaymentRecord } = await import('../services/airtable.js');
        await updatePaymentRecord(paymentId, newAmount, `تم التعديل عبر البوت`);
        
        await ctx.reply(
          `✅ **تم تعديل المدفوعة بنجاح!**\n\n` +
          `📍 البلد: ${wilayaEdit}\n` +
          `💰 المبلغ الجديد: ${newAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
          `📅 التاريخ: ${new Date().toLocaleDateString('ar-DZ')}`,
          { parse_mode: 'Markdown' }
        );
        
        // العودة إلى قائمة المدفوعات المحدثة
        const { getDistributorPaymentHistory } = await import('../services/airtable.js');
        const { formatPaymentsList } = await import('./ui.js');
        
        const paymentHistory = await getDistributorPaymentHistory(wilayaEdit);
        const { message, keyboard } = formatPaymentsList(paymentHistory, wilayaEdit);
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
        
      } catch (error) {
        logger.error({ error, paymentId, newAmount }, 'Failed to update payment record');
        await ctx.reply('❌ حدث خطأ أثناء تعديل المدفوعة. يرجى المحاولة مرة أخرى.');
      } finally {
        // تنظيف حالة المستخدم
        userStates.delete(userId);
      }
      break;
    default:
      break;
  }
}

export async function finalizeMediaGroup(ctx: Context, mediaFiles: string[]) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (!state || state.step !== 'awaiting_photos') return;

  const uniqueFiles = Array.from(new Set(mediaFiles));

  if (uniqueFiles.length === 0) {
    await editWizardMessage(ctx, state, L.noPhotos, getWizardNavKeyboard());
    return;
  }

  if (uniqueFiles.length > MAX_PHOTOS) {
    await editWizardMessage(ctx, state, L.tooManyPhotos, getWizardNavKeyboard());
    state.telegramFileIds = [];
    return;
  }

  state.telegramFileIds = uniqueFiles;
  await promptForCustomerName(ctx, state);
}
