import 'dotenv/config';
import './lib/registerWhatwgUrlShim.js';
import http from 'node:http'; // <-- ✅ استيراد بالطريقة الصحيحة
import { Telegraf, Markup, type Context, type NarrowedContext } from 'telegraf';
import { logger } from './lib/logger.js';
import { L, formatOrderMessage, getMainMenuKeyboard, getStatisticsWilayasKeyboard, getStatisticsActionsKeyboard, getStatusFilterKeyboard, formatWilayaStatisticsReport, formatOrdersList, getStatusDisplayText, formatPaymentsList, getPaymentEditKeyboard } from './bot/ui.js';
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
import { fetchOrderById, fetchAllOrders, updateOrderStatus, getOrderStatus, deleteOrder, getOrdersByWilaya, getOrderStatisticsByWilaya, getOrdersByWilayaAndStatus, recordDistributorPayment, getTotalReceivedFromDistributor, getDistributorPaymentHistory, deletePaymentRecord, updatePaymentRecord } from './services/airtable.js';
import { isUserAuthorized } from './bot/auth.js';
import { updateChannelOrderStatus, deleteOrderFromChannel } from './services/telegram.js';

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
  
  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => { // استمع على الخادم
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

  bot.hears(L.statistics, async (ctx) => {
    // التحقق من الصلاحيات
    if (!isUserAuthorized(ctx.from.id)) {
        await ctx.reply('ليس لديك الصلاحية لعرض الإحصائيات.');
        return;
    }

    await ctx.reply(
        '📊 *إحصائيات البلدان*\n\nاختر البلد لعرض إحصائياته:',
        {
            parse_mode: 'Markdown',
            ...getStatisticsWilayasKeyboard()
        }
    );
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
    
    // معالجة خاصة لحذف الطلب عند الضغط على "إلغاء الطلبية"
    if (newStatus === 'canceled') {
      await ctx.answerCbQuery(`حذف الطلب ${orderId} نهائياً...`);
      
      try {
        // التأكد من وجود الطلب أولاً
        const currentStatus = await getOrderStatus(orderId);
        if (!currentStatus) {
          await ctx.answerCbQuery(`⚠️ الطلب ${orderId} غير موجود`);
          return;
        }
        
        // حذف الطلب من قاعدة البيانات
        await deleteOrder(orderId);
        
        // حذف/تحديث رسائل القناة
        const messageId = ctx.callbackQuery.message?.message_id;
        await deleteOrderFromChannel(bot, orderId, messageId);
        
        logger.info({ orderId }, 'Order permanently deleted successfully');
        await ctx.answerCbQuery(`✅ تم حذف الطلب ${orderId} نهائياً من النظام`);
        
      } catch (error) {
        logger.error({ error, orderId }, 'Failed to delete order permanently');
        await ctx.answerCbQuery('❌ حدث خطأ أثناء حذف الطلب');
      }
      return;
    }
    
    // معالجة طبيعية لتحديث الحالات الأخرى
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

  // معالجات نظام الإحصائيات
  bot.action(/^stats:wilaya:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery(`جلب إحصائيات ${wilaya}...`);

    try {
      const stats = await getOrderStatisticsByWilaya(wilaya);
      const totalReceived = await getTotalReceivedFromDistributor(wilaya);
      const report = formatWilayaStatisticsReport(wilaya, stats, totalReceived);
      
      await ctx.editMessageText(report, {
        parse_mode: 'Markdown',
        ...getStatisticsActionsKeyboard(wilaya)
      });
    } catch (error) {
      logger.error({ error, wilaya }, 'Failed to fetch wilaya statistics');
      await ctx.answerCbQuery('❌ حدث خطأ في جلب الإحصائيات');
    }
  });

  bot.action(/^stats:details:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery(`جلب تفاصيل طلبيات ${wilaya}...`);

    try {
      const orders = await getOrdersByWilaya(wilaya);
      const message = formatOrdersList(orders, `📋 طلبيات ${wilaya} (إجمالي: ${orders.length})`);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...getStatisticsActionsKeyboard(wilaya)
      });
    } catch (error) {
      logger.error({ error, wilaya }, 'Failed to fetch wilaya orders');
      await ctx.answerCbQuery('❌ حدث خطأ في جلب الطلبات');
    }
  });

  bot.action(/^stats:filter:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery('اختر الحالة للفلترة...');

    await ctx.editMessageText(
      `🔍 *فلترة طلبيات ${wilaya} حسب الحالة*\n\nاختر الحالة المطلوبة:`,
      {
        parse_mode: 'Markdown',
        ...getStatusFilterKeyboard(wilaya)
      }
    );
  });

  bot.action(/^stats:status:(.+):(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    const status = ctx.match[2];
    await ctx.answerCbQuery(`جلب طلبيات ${status}...`);

    try {
      const orders = await getOrdersByWilayaAndStatus(wilaya, status);
      const statusText = getStatusDisplayText(status);
      const message = formatOrdersList(orders, `📋 طلبيات ${wilaya} - ${statusText} (إجمالي: ${orders.length})`);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...getStatusFilterKeyboard(wilaya)
      });
    } catch (error) {
      logger.error({ error, wilaya, status }, 'Failed to fetch filtered orders');
      await ctx.answerCbQuery('❌ حدث خطأ في جلب الطلبات');
    }
  });

  bot.action(/^stats:accounting:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery(`حساب تقرير المحاسبة...`);

    try {
      const stats = await getOrderStatisticsByWilaya(wilaya);
      const shippedAmount = stats.byStatus.shipped.amount;
      const deliveredAmount = stats.byStatus.delivered.amount;
      const totalForAccounting = shippedAmount + deliveredAmount;
      
      const accountingReport = (
        `💼 *تقرير المحاسبة - ${wilaya}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🚚 *المرسل للموزع:*\n` +
        `   • عدد الطلبيات: ${stats.byStatus.shipped.count}\n` +
        `   • إجمالي المبلغ: ${shippedAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n\n` +
        `📦 *المسلم من الموزع:*\n` +
        `   • عدد الطلبيات: ${stats.byStatus.delivered.count}\n` +
        `   • إجمالي المبلغ: ${deliveredAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 **إجمالي المطلوب تحصيله: ${totalForAccounting.toLocaleString('ar-DZ', { useGrouping: false })} د.ج**`
      );
      
      await ctx.editMessageText(accountingReport, {
        parse_mode: 'Markdown',
        ...getStatisticsActionsKeyboard(wilaya)
      });
    } catch (error) {
      logger.error({ error, wilaya }, 'Failed to generate accounting report');
      await ctx.answerCbQuery('❌ حدث خطأ في إعداد التقرير');
    }
  });

  bot.action('stats:back', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '📊 *إحصائيات البلدان*\n\nاختر البلد لعرض إحصائياته:',
      {
        parse_mode: 'Markdown',
        ...getStatisticsWilayasKeyboard()
      }
    );
  });

  // معالجات نظام المدفوعات والعمولات
  bot.action(/^payment:receive:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery();
    
    // حفظ الولاية في حالة المستخدم لاستخدامها عند إدخال المبلغ
    let state = userStates.get(ctx.from.id);
    if (!state) {
      state = { step: 'awaiting_payment_amount', wilayaForPayment: wilaya } as any;
      userStates.set(ctx.from.id, state);
    } else {
      state.step = 'awaiting_payment_amount';
      state.wilayaForPayment = wilaya;
    }
    
    await ctx.editMessageText(
      `💰 *تسجيل استلام مبلغ من موزع ${wilaya}*\n\n` +
      `يرجى إدخال المبلغ المستلم (بالأرقام فقط):\n\n` +
      `مثال: 5000`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ إلغاء', `stats:wilaya:${wilaya}`)]
        ])
      }
    );
  });

  bot.action(/^payment:history:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery(`جلب تاريخ المدفوعات لـ ${wilaya}...`);

    try {
      const [totalReceived, stats, paymentHistory] = await Promise.all([
        getTotalReceivedFromDistributor(wilaya),
        getOrderStatisticsByWilaya(wilaya),
        getDistributorPaymentHistory(wilaya)
      ]);
      
      // حساب التفاصيل المالية
      const shippedAmount = stats.byStatus.shipped.amount;
      const deliveredAmount = stats.byStatus.delivered.amount;
      const totalOrderAmount = shippedAmount + deliveredAmount;
      
      // حساب العمولات (استيراد الدالة من ملف العمولات)
      const { getDistributorCommission, calculateRemainingBalance, hasCreditBalance, getCreditAmount } = await import('./lib/commission.js');
      const commission = getDistributorCommission(wilaya);
      const totalOrdersForAccounting = stats.byStatus.shipped.count + stats.byStatus.delivered.count;
      const totalCommissions = commission * totalOrdersForAccounting;
      const totalCollectible = totalOrderAmount - totalCommissions;
      const remainingBalance = calculateRemainingBalance(totalCollectible, totalReceived);
      const hasCredit = hasCreditBalance(remainingBalance);
      const creditAmount = getCreditAmount(remainingBalance);
      
      // بناء قسم عرض الرصيد مع نظام الائتمان
      let balanceSection;
      if (hasCredit) {
        balanceSection = (
          `💰 *حالة المدفوعات:*\n` +
          `• المستلم: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
          `• 🟢 **رصيد ائتمان: ${creditAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج**\n\n` +
          `📊 *حالة الحساب:* متقدم في الدفع`
        );
      } else if (remainingBalance === 0) {
        balanceSection = (
          `💰 *حالة المدفوعات:*\n` +
          `• المستلم: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
          `• ✅ **تم التحصيل بالكامل**\n\n` +
          `📊 *حالة الحساب:* مكتمل`
        );
      } else {
        balanceSection = (
          `💰 *حالة المدفوعات:*\n` +
          `• المستلم: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
          `• المتبقي: ${remainingBalance.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n\n` +
          `📊 *حالة الحساب:* ${totalCollectible > 0 ? Math.round((totalReceived / totalCollectible) * 100) : 0}% مكتمل`
        );
      }
      
      // بناء تقرير تاريخ المدفوعات
      let historyReport = (
        `📈 *تقرير المدفوعات - ${wilaya}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💵 *الملخص المالي:*\n` +
        `• إجمالي قيمة الطلبيات: ${totalOrderAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
        `• عمولة الموزع: ${totalCommissions.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
        `• المطلوب تحصيله: ${totalCollectible.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n\n` +
        balanceSection
      );
      
      // إضافة تاريخ المدفوعات إذا وجد
      if (paymentHistory && paymentHistory.length > 0) {
        historyReport += `📋 *سجل المدفوعات:*\n`;
        paymentHistory.slice(0, 5).forEach((payment, index) => {
          const date = payment.createdAt ? new Date(payment.createdAt as string).toLocaleDateString('ar-DZ') : 'غير محدد';
          historyReport += `${index + 1}. ${(payment.amount || 0).toLocaleString('ar-DZ', { useGrouping: false })} د.ج - ${date}\n`;
        });
        
        if (paymentHistory.length > 5) {
          historyReport += `... و${paymentHistory.length - 5} عمليات أخرى\n`;
        }
      } else {
        historyReport += `📋 *سجل المدفوعات:*\n⚠️ لا توجد عمليات دفع مسجلة بعد.\n`;
      }
      
      await ctx.editMessageText(historyReport, {
        parse_mode: 'Markdown',
        ...getStatisticsActionsKeyboard(wilaya)
      });
    } catch (error) {
      logger.error({ error, wilaya }, 'Failed to fetch payment history');
      await ctx.answerCbQuery('❌ حدث خطأ في جلب تاريخ المدفوعات');
    }
  });

  // معالجات إدارة المدفوعات
  bot.action(/^payment:manage:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery();
    
    const { getPaymentManagementKeyboard } = await import('./bot/ui.js');
    
    await ctx.editMessageText(
      `📊 *إدارة مدفوعات ${wilaya}*\n\nاختر الإجراء المطلوب:`,
      {
        parse_mode: 'Markdown',
        ...getPaymentManagementKeyboard(wilaya)
      }
    );
  });

  bot.action(/^payment:list:(.+)$/, async (ctx) => {
    const wilaya = ctx.match[1];
    await ctx.answerCbQuery(`جلب قائمة مدفوعات ${wilaya}...`);

    try {
      const paymentHistory = await getDistributorPaymentHistory(wilaya);
      const { message, keyboard } = formatPaymentsList(paymentHistory, wilaya);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      logger.error({ error, wilaya }, 'Failed to fetch payment list');
      await ctx.answerCbQuery('❌ حدث خطأ في جلب قائمة المدفوعات');
    }
  });

  bot.action(/^payment:select:(.+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    await ctx.answerCbQuery();
    
    // استخراج الولاية من معرف الدفعة
    const wilaya = paymentId.split('-')[1]; // معرف الدفعة بصيغة PAYMENT-ولاية-تاريخ
    
    await ctx.editMessageText(
      `✏️ *تعديل الدفعة*

💰 معرف الدفعة: ${paymentId}
📍 البلد: ${wilaya}

اختر الإجراء:`,
      {
        parse_mode: 'Markdown',
        ...getPaymentEditKeyboard(paymentId, wilaya)
      }
    );
  });

  bot.action(/^payment:edit:(.+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    await ctx.answerCbQuery();
    
    const wilaya = paymentId.split('-')[1];
    
    // حفظ معرف الدفعة والولاية في حالة المستخدم
    let state = userStates.get(ctx.from.id);
    if (!state) {
      state = { step: 'awaiting_payment_edit', paymentIdForEdit: paymentId, wilayaForPayment: wilaya } as any;
      userStates.set(ctx.from.id, state);
    } else {
      state.step = 'awaiting_payment_edit';
      state.paymentIdForEdit = paymentId;
      state.wilayaForPayment = wilaya;
    }
    
    await ctx.editMessageText(
      `✏️ *تعديل مبلغ الدفعة*\n\n` +
      `💰 معرف الدفعة: ${paymentId}\n` +
      `📍 البلد: ${wilaya}\n\n` +
      `يرجى إدخال المبلغ الجديد (بالأرقام فقط):\n\n` +
      `مثال: 7500`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ إلغاء', `payment:select:${paymentId}`)]
        ])
      }
    );
  });

  bot.action(/^payment:delete:(.+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    const wilaya = paymentId.split('-')[1];
    
    await ctx.answerCbQuery(`حذف الدفعة ${paymentId}...`);

    try {
      await deletePaymentRecord(paymentId);
      
      await ctx.editMessageText(
        `✅ *تم حذف الدفعة بنجاح*\n\n` +
        `💰 معرف الدفعة: ${paymentId}\n` +
        `📍 البلد: ${wilaya}\n` +
        `📅 التاريخ: ${new Date().toLocaleDateString('ar-DZ')}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ عودة للقائمة', `payment:list:${wilaya}`)]
          ])
        }
      );
    } catch (error) {
      logger.error({ error, paymentId }, 'Failed to delete payment record');
      await ctx.answerCbQuery('❌ حدث خطأ في حذف الدفعة');
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
