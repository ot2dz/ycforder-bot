import 'dotenv/config';
import './lib/registerWhatwgUrlShim.ts';
import http from 'node:http'; // <-- ✅ استيراد بالطريقة الصحيحة
import { Telegraf, Markup, type Context, type NarrowedContext } from 'telegraf';
import type { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { logger } from './lib/logger.ts';
import { L, formatOrderMessage, getMainMenuKeyboard } from './bot/ui.js';
import { userStates } from './bot/types.js';
import {
  finalizeMediaGroup,
  handleCancel,
  handleConfirm,
  handleTextInput,
  promptForAddress,
  promptForAmount,
  promptForCustomerName,
  promptForNotes,
  promptForPhone,
  promptForStateCommune,
  showReview,
  startWizard
} from './bot/wizard.js';
import { fetchOrderById, fetchAllOrders, updateOrderStatus, getOrderStatus } from './services/airtable.js';
import { isUserAuthorized } from './bot/auth.js';
import { updateChannelOrderStatus } from './services/telegram.js';

interface MediaGroupCacheEntry {
  fileIds: string[];
  timeout?: NodeJS.Timeout;
}

const mediaGroupCache = new Map<string, MediaGroupCacheEntry>();

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error('TELEGRAM_BOT_TOKEN is not set in the .env file. Aborting.');
    process.exit(1);
  }

  const bot = new Telegraf(botToken);

  // --- Health Check Server ---
  // نقوم بنقل الخادم إلى داخل الدالة الرئيسية لضمان عدم تشغيله إلا بعد نجاح كل شيء
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => { // استمع على 0.0.0.0 ليكون متوافقاً مع Docker
    logger.info(`Health check server running on port ${PORT}`);
  });

  bot.hears(L.newOrder, async (ctx) => {
    if (userStates.has(ctx.from.id)) {
      await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
      return;
    }
    await startWizard(ctx);
  });

  bot.hears(L.myOrders, async (ctx) => { // الزر الآن اسمه "عرض الطلبات"
    // الخطوة 1: التحقق من الصلاحيات
    if (!isUserAuthorized(ctx.from.id)) {
        await ctx.reply('ليس لديك الصلاحية لعرض الطلبات.');
        return;
    }

    try {
        await ctx.reply('⏳ جارِ البحث عن الطلبات...');
        const orders = await fetchAllOrders(); // <-- جلب كل الطلبات

        if (orders.length === 0) {
            await ctx.reply('لا توجد أي طلبيات مسجلة حالياً.');
            return;
        }

        await ctx.reply(`لقد وجدت ${orders.length} طلبات:`);

        for (const order of orders) { 
            try {
                logger.debug({ order }, 'Processing order summary for display.');

                // --- بناء الملخص بطريقة آمنة ---
                logger.debug('Step 1: Processing customer name');
                const name = order.customerName || 'غير متوفر';
                logger.debug({ name }, 'Customer name processed');
                
                logger.debug('Step 2: Processing state commune');
                const state = order.stateCommune || 'غير متوفر';
                logger.debug({ state }, 'State commune processed');
                
                logger.debug('Step 3: Processing amount');
                const amount = order.amountTotal ? `${order.amountTotal} د.ج` : 'غير متوفر';
                logger.debug({ amount }, 'Amount processed');
                
                logger.debug('Step 4: Building summary string');
                const summary = `*الاسم:* ${name} | *البلد:* ${state} | *المبلغ:* ${amount}`;
                logger.debug({ summary }, 'Summary built successfully');
                
                logger.debug('Step 5: Building message string');
                const message = `*الطلبية رقم:* \`${order.orderId}\`\n------------------\n${summary}\n------------------`;
                logger.debug({ message }, 'Message built successfully');
                
                logger.debug('Step 6: Creating keyboard');
                const keyboard = Markup.inlineKeyboard([
                    Markup.button.callback('تفاصيل الطلبية', `details:${order.orderId}`)
                ]);
                logger.debug('Keyboard created successfully');
                
                logger.debug('Step 7: Sending reply to Telegram');
                await ctx.reply(message, { ...keyboard, parse_mode: 'Markdown' });
                logger.debug('Reply sent successfully');
                // ---------------------------------
            } catch (error: any) {
                // هذا الجزء سيخبرنا بالحقيقة
                logger.error({ 
                    error: {
                        message: error?.message || 'Unknown error',
                        stack: error?.stack || 'No stack trace',
                        name: error?.name || 'Unknown error type',
                        toString: error?.toString() || 'Error toString failed'
                    }, 
                    problematicOrder: order,
                    errorType: typeof error,
                    errorKeys: Object.keys(error || {})
                }, 'Failed to process and display a single order summary.');
                // سنستمر في عرض باقي الطلبات بدلاً من التوقف
                continue;
            }
        }
    } catch (error) {
        logger.error({ error, userId: ctx.from.id }, 'Failed to fetch all orders.');
        await ctx.reply('حدث خطأ أثناء جلب الطلبات. يرجى المحاولة مرة أخرى.');
    }
  });
  bot.hears(L.help, (ctx) => ctx.reply('لإنشاء طلب جديد، اضغط على زر "🆕 إنشاء طلب جديد" في الأسفل. لإلغاء الطلب أثناء إدخاله، استخدم زر "❌ إلغاء" الموجود أسفل الرسالة.'));

  bot.start(async (ctx) => {
    logger.info({ user: ctx.from }, 'User started the bot.');
    await ctx.reply(L.welcome, getMainMenuKeyboard());
  });

  bot.command('neworder', async (ctx) => {
    if (userStates.has(ctx.from.id)) {
      await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
      return;
    }
    await startWizard(ctx);
  });

  bot.on('photo', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const state = userStates.get(userId);
    if (!state || state.step !== 'awaiting_photos') return;

    const photoSizes = (ctx.message as any).photo;
    if (!photoSizes?.length) return;

    const fileId = photoSizes.at(-1)?.file_id;
    if (!fileId) return;

    const mediaGroupId = (ctx.message as any).media_group_id as string | undefined;

    if (mediaGroupId) {
      let entry = mediaGroupCache.get(mediaGroupId);
      if (!entry) {
        entry = { fileIds: [] };
        mediaGroupCache.set(mediaGroupId, entry);
      }
      entry.fileIds.push(fileId);

      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }

      entry.timeout = setTimeout(async () => {
        mediaGroupCache.delete(mediaGroupId);
        try {
          await finalizeMediaGroup(ctx, entry!.fileIds);
        } catch (error) {
          logger.error({ error }, 'Failed to finalize media group.');
        }
      }, 600);
    } else {
      await finalizeMediaGroup(ctx, [fileId]);
    }
  });

  bot.on('text', handleTextInput);

  bot.action(/details:(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery(`جلب تفاصيل الطلب ${orderId}...`);

    try {
        const orderDetails = await fetchOrderById(orderId);
        if (!orderDetails) {
            await ctx.reply(`لم أتمكن من العثور على تفاصيل الطلبية رقم: ${orderId}`);
            return;
        }
        
        // عرض الصور أولاً
        const mediaGroup = (orderDetails.cloudinaryPhotoData || []).map(photo => ({
            type: 'photo' as const,
            media: photo.secure_url,
        }));
        if (mediaGroup.length > 0) await ctx.replyWithMediaGroup(mediaGroup as any);
        
        // ثم عرض النص بالتنسيق الجديد
        await ctx.reply(formatOrderMessage(orderDetails as any, orderId, false), { parse_mode: 'Markdown' });
    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order details.');
        await ctx.reply('حدث خطأ أثناء جلب تفاصيل الطلب.');
    }
  });

  // معالج أزرار إلغاء الحالات (يجب أن يكون دقيقاً ومحدداً ويأتي أولاً)
  bot.action(/^cancel_status:(prepared|shipped|delivered):(.+)$/, async (ctx) => {
    const previousStatus = ctx.match[1];
    const orderId = ctx.match[2];
    
    logger.info({ callbackData: (ctx.callbackQuery as any).data, previousStatus, orderId }, 'Cancel status button clicked');
    await ctx.answerCbQuery(`إلغاء حالة الطلب ${orderId}...`);

    try {
        // تحقق من الحالة الحالية
        const currentStatus = await getOrderStatus(orderId);
        logger.info({ orderId, currentStatus, expectedStatus: previousStatus }, 'Status validation for cancellation');
        
        if (currentStatus !== previousStatus) {
            logger.warn({ orderId, currentStatus, previousStatus }, 'Current status does not match the status being cancelled');
            await ctx.answerCbQuery(`⚠️ الطلب ليس في حالة: ${getStatusText(previousStatus)}`);
            return;
        }
        
        logger.info({ orderId, from: currentStatus, to: 'preparing' }, 'Updating status to preparing');
        await updateOrderStatus(orderId, 'preparing');
        
        // تحديث رسالة القناة بالحالة الجديدة
        const messageId = ctx.callbackQuery.message?.message_id;
        await updateChannelOrderStatus(bot, orderId, 'preparing', messageId);
        
        logger.info({ orderId, previousStatus }, 'Order status reverted to preparing');
        await ctx.answerCbQuery(`✅ تم إلغاء حالة: ${getStatusText(previousStatus)}`);
    } catch (error) {
        logger.error({ error, orderId, previousStatus }, 'Failed to revert order status');
        await ctx.answerCbQuery('❌ حدث خطأ أثناء إلغاء حالة الطلب');
    }
  });

  // معالج أزرار تغيير حالة الطلبات في القناة (يجب أن يكون دقيقاً لتجنب تضارب مع cancel_status)
  bot.action(/^status:(prepared|shipped|delivered|canceled|preparing):(.+)$/, async (ctx) => {
    const newStatus = ctx.match[1];
    const orderId = ctx.match[2];
    
    await ctx.answerCbQuery(`تحديث حالة الطلب ${orderId}...`);

    try {
        // أولاً تحقق من الحالة الحالية لتجنب التحديثات المكررة
        const currentStatus = await getOrderStatus(orderId);
        
        if (currentStatus === newStatus) {
            logger.warn({ orderId, currentStatus, newStatus }, 'Status is already set to the requested value');
            await ctx.answerCbQuery(`⚠️ الطلب بالفعل في حالة: ${getStatusText(newStatus)}`);
            return;
        }
        
        await updateOrderStatus(orderId, newStatus);
        
        // تحديث رسالة القناة بالحالة الجديدة
        const messageId = ctx.callbackQuery.message?.message_id;
        await updateChannelOrderStatus(bot, orderId, newStatus, messageId);
        
        logger.info({ orderId, oldStatus: currentStatus, newStatus }, 'Order status updated successfully');
        await ctx.answerCbQuery(`✅ تم تحديث حالة الطلب إلى: ${getStatusText(newStatus)}`);
    } catch (error) {
        logger.error({ error, orderId, newStatus }, 'Failed to update order status');
        await ctx.answerCbQuery('❌ حدث خطأ أثناء تحديث حالة الطلب');
    }
  });

  bot.on('callback_query', async (ctx: any) => {
    const action = ctx.callbackQuery.data ?? 'unknown';
    const userId = ctx.from?.id;
    const state = userStates.get(userId ?? -1);

    logger.info({ userId, action }, 'Button pressed.');

    let handled = true;

    // معالجة أزرار الولايات
    if (action.startsWith('order:set_wilaya:')) {
        if (!state) return;
        const wilaya = action.replace('order:set_wilaya:', '');
        state.stateCommune = wilaya;
        await ctx.answerCbQuery(`${wilaya} ✅`);
        if (state.isEditing) {
            state.isEditing = false;
            await showReview(ctx, state);
        } else {
            await promptForAddress(ctx, state);
        }
        return; // تم التعامل مع الطلب
    }

    switch (action) {
      case 'order:start':
        await ctx.answerCbQuery();
        if (userStates.has(ctx.from.id)) {
          await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
          break;
        }
        await startWizard(ctx);
        break;
      case 'order:cancel':
        await ctx.answerCbQuery();
        await handleCancel(ctx);
        break;
      case 'order:back':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        switch (state.step) {
          case 'awaiting_customer_name':
            await startWizard(ctx);
            break;
          case 'awaiting_phone':
            await promptForCustomerName(ctx, state);
            break;
          case 'awaiting_state_commune':
            await promptForPhone(ctx, state);
            break;
          case 'awaiting_address':
            await promptForStateCommune(ctx, state);
            break;
          case 'awaiting_amount_total':
            await promptForAddress(ctx, state);
            break;
          case 'awaiting_notes':
            await promptForAmount(ctx, state);
            break;
          case 'reviewing':
            await promptForNotes(ctx, state);
            break;
          default:
            handled = false;
            break;
        }
        break;
      case 'order:next':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        switch (state.step) {
          case 'awaiting_address':
            delete state.address;
            await promptForAmount(ctx, state);
            break;
          case 'awaiting_notes':
            delete state.notes;
            await showReview(ctx, state);
            break;
          default:
            handled = false;
            break;
        }
        break;
      case 'order:confirm':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await handleConfirm(bot, ctx, state); // مرر نسخة البوت
        break;
      case 'order:edit:name':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true; // وضع علامة أننا في وضع التعديل
        await ctx.answerCbQuery();
        await promptForCustomerName(ctx, state);
        break;
      case 'order:edit:phone':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForPhone(ctx, state);
        break;
      case 'order:edit:state_commune': // زر تعديل الولاية الجديد
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForStateCommune(ctx, state);
        break;
      case 'order:edit:address':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForAddress(ctx, state);
        break;
      case 'order:edit:amount':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForAmount(ctx, state);
        break;
      case 'order:edit:notes':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForNotes(ctx, state);
        break;
      case 'orders:list':
      case 'help':
        await ctx.answerCbQuery('قريباً...');
        break;
      default:
        handled = false;
        break;
    }

    if (!handled) {
      await ctx.answerCbQuery('تم استلام الإجراء.');
    }
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  logger.info('Bot is starting...');
  await bot.launch();
}

// دالة مساعدة لتحويل حالة الطلب إلى نص عربي
function getStatusText(status: string): string {
  switch (status) {
    case 'preparing': return 'قيد التجهيز';
    case 'prepared': return 'تم التجهيز';
    case 'shipped': return 'تم الإرسال';
    case 'delivered': return 'تم التسليم';
    case 'canceled': return 'تم الإلغاء';
    default: return 'غير معروف';
  }
}

main().catch((error) => {
  logger.error(error, 'Unhandled error during service startup');
  process.exit(1);
});
