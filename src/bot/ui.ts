import { Markup } from 'telegraf';
import type { OrderState } from './types.js';
import { getDistributorCommission, calculateRemainingBalance, hasCreditBalance, getCreditAmount } from '../lib/commission.js';

export const L = {
  welcome: 'مرحباً بك! كيف يمكنني خدمتك؟',
  wizardSendPhotos: 'الرجاء إرسال صور المنتج (من 1 إلى 10 صور). يمكنك إرسالها كألبوم واحد.',
  photosReceived: '📸 تم استلام الصور.',
  askCustomerName: 'الآن، يرجى إدخال *الاسم الكامل* للزبون:',
  askPhone: '👤 تم تسجيل الاسم.\n\nالآن، يرجى إدخال *رقم هاتف* الزبون:',
  askStateCommune: '📞 تم تسجيل رقم الهاتف.\n\nالآن، يرجى إدخال *الولاية والبلدية*:',
  askAddress: '📍 تم تسجيل الولاية/البلدية.\n\nالآن، أدخل *العنوان الكامل* للتوصيل (اختياري).',
  askAmount: '🏠 تم تسجيل العنوان.\n\nالآن، يرجى إدخال *المبلغ الإجمالي* للطلب (بالأرقام فقط):',
  askNotes: '💰 تم تسجيل المبلغ.\n\nهل لديك أي *ملاحظات* إضافية؟ (اختياري)',
  invalidPhone: '⚠️ رقم الهاتف غير صالح. يرجى المحاولة مرة أخرى:',
  invalidAmount: '⚠️ المبلغ غير صالح. يرجى إدخال أرقام فقط:',
  tooManyPhotos: '⚠️ يُسمح بحد أقصى 10 صور لكل طلب. يرجى إعادة المحاولة.',
  noPhotos: '⚠️ يجب إرسال صورة واحدة على الأقل.',
  // الولايات الثابتة
  stateAinSalah: 'عين صالح',
  stateTamanrasset: 'تمنراست',
  stateAoulef: 'أولف',
  stateAdrar: 'أدرار',
  stateReggane: 'رقان',
  // Main Menu
  newOrder: '🆕 طلب جديد', // اختصار بسيط
  myOrders: '📦 عرض الطلبات', // <-- التغيير هنا
  statistics: '📊 إحصائيات البلدان', // جديد
  help: 'ℹ️ مساعدة',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  skip: '⏩ تخطي',
  confirm: '✅ تأكيد الطلب',
  editName: '✏️ تعديل الاسم',
  editPhone: '✏️ تعديل الهاتف',
  editStateCommune: '✏️ تعديل الولاية',
  editAddress: '✏️ تعديل العنوان',
  editAmount: '✏️ تعديل المبلغ',
  editNotes: '✏️ تعديل الملاحظات',
  // أزرار التحكم في القناة
  statusPrepared: '✅ تم التجهيز',
  statusShipped: '🚚 تم الإرسال',
  statusDelivered: '📦 تم التسليم',
  statusCanceled: '❌ إلغاء الطلبية',

  orderCanceled: 'تم إلغاء الطلب.',
  orderConfirmed: '✅ تم إنشاء الطلب بنجاح!',
  processingOrder: '⏳ جارٍ تأكيد الطلب وتحميل الصور...'
} as const;

type InlineKeyboardMarkup = ReturnType<typeof Markup.inlineKeyboard>;
type ReplyKeyboardMarkup = ReturnType<typeof Markup.keyboard>;

export function getMainMenuKeyboard(): ReplyKeyboardMarkup {
  return Markup.keyboard([
    [Markup.button.text(L.newOrder)],
    [Markup.button.text(L.myOrders), Markup.button.text(L.statistics)],
    [Markup.button.text(L.help)]
  ]).resize();
}

export function removeKeyboard() {
  return Markup.removeKeyboard();
}

export function getWizardNavKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    Markup.button.callback(L.back, 'order:back'),
    Markup.button.callback(L.cancel, 'order:cancel')
  ]);
}

export function getWilayasKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.stateAinSalah, 'order:set_wilaya:عين صالح')],
    [Markup.button.callback(L.stateTamanrasset, 'order:set_wilaya:تمنراست')],
    [Markup.button.callback(L.stateAoulef, 'order:set_wilaya:أولف')],
    [Markup.button.callback(L.stateAdrar, 'order:set_wilaya:أدرار')],
    [Markup.button.callback(L.stateReggane, 'order:set_wilaya:رقان')],
    [Markup.button.callback(L.cancel, 'order:cancel')] // زر الإلغاء مهم هنا
  ]);
}

/**
 * قائمة اختيار البلدان للإحصائيات
 */
export function getStatisticsWilayasKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 عين صالح', 'stats:wilaya:عين صالح')],
    [Markup.button.callback('📊 تمنراست', 'stats:wilaya:تمنراست')],
    [Markup.button.callback('📊 أولف', 'stats:wilaya:أولف')],
    [Markup.button.callback('📊 أدرار', 'stats:wilaya:أدرار')],
    [Markup.button.callback('📊 رقان', 'stats:wilaya:رقان')]
  ]);
}

/**
 * قائمة أزرار خيارات الإحصائيات
 */
export function getStatisticsActionsKeyboard(wilaya: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 عرض التفاصيل', `stats:details:${wilaya}`)],
    [Markup.button.callback('🔍 فلترة حسب الحالة', `stats:filter:${wilaya}`),
     Markup.button.callback('💼 تقرير المحاسبة', `stats:accounting:${wilaya}`)],
    [Markup.button.callback('💰 استلام مبلغ', `payment:receive:${wilaya}`),
     Markup.button.callback('📊 إدارة المدفوعات', `payment:manage:${wilaya}`)],
    [Markup.button.callback('⬅️ عودة', 'stats:back')]
  ]);
}

/**
 * قائمة فلترة الحالات
 */
export function getStatusFilterKeyboard(wilaya: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔍 قيد التجهيز', `stats:status:${wilaya}:preparing`)],
    [Markup.button.callback('✅ تم التجهيز', `stats:status:${wilaya}:prepared`)],
    [Markup.button.callback('🚚 تم الإرسال', `stats:status:${wilaya}:shipped`)],
    [Markup.button.callback('📦 تم التسليم', `stats:status:${wilaya}:delivered`)],
    [Markup.button.callback('⬅️ عودة', `stats:wilaya:${wilaya}`)]
  ]);
}

export function getOptionalStepKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.skip, 'order:next')],
    [
      Markup.button.callback(L.back, 'order:back'),
      Markup.button.callback(L.cancel, 'order:cancel')
    ]
  ]);
}

export function getReviewKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.confirm, 'order:confirm')],
    [
      Markup.button.callback(L.editName, 'order:edit:name'),
      Markup.button.callback(L.editPhone, 'order:edit:phone')
    ],
    [
      Markup.button.callback(L.editStateCommune, 'order:edit:state_commune'),
      Markup.button.callback(L.editAddress, 'order:edit:address'),
    ],
    [
      Markup.button.callback(L.editAmount, 'order:edit:amount')
    ],
    [Markup.button.callback(L.editNotes, 'order:edit:notes')],
    [Markup.button.callback(L.cancel, 'order:cancel')]
  ]);
}

const markdownEscapeRegex = /([\\_*\[\]()~`>#+=|{}!-])/g; // تم حذف النقطة (.) من هنا

export function escapeMarkdown(text?: string): string {
  if (!text) return '';
  return text.replace(markdownEscapeRegex, '\\$1');
}

/**
 * تنسق رسالة تفاصيل الطلب بالتنسيق الجديد المطلوب
 * @param state بيانات الطلب
 * @param orderId معرف الطلب (اختياري)
 * @param isReview هل هذا للمراجعة أم للعرض النهائي
 * @param status حالة الطلب (اختياري)
 */
export function formatOrderMessage(state: OrderState, orderId?: string, isReview: boolean = false, status?: string): string {
  const title = isReview ? 'يرجى مراجعة تفاصيل الطلب:' : `طلب جديد: ${orderId || 'غير محدد'}`;
  const separator = '———————————————';
  
  const amountLabel = state.amountTotal !== undefined ? 
    `${state.amountTotal.toLocaleString('ar-DZ', { useGrouping: false })} د.ج` 
    : 'غير محدد';
  
  const photosCount = state.telegramFileIds?.length || state.cloudinaryPhotoData?.length || 0;
  
  // إضافة حالة الطلب إذا كانت متوفرة
  const statusLine = status && !isReview ? 
    `${separator}\n✨ الحالة: ${getStatusDisplayText(status)}\n` 
    : '';
  
  return (
    `*${title}*\n` +
    `${separator}\n` +
    `👤 الاسم الكامل: ${escapeMarkdown(state.customerName) || 'غير محدد'}\n` +
    `${separator}\n` +
    `📞 رقم الهاتف: ${escapeMarkdown(state.phone) || 'غير محدد'}\n` +
    `${separator}\n` +
    `📍 الولاية/البلدية: ${escapeMarkdown(state.stateCommune) || 'غير محدد'}\n` +
    `${separator}\n` +
    `🏠 العنوان: ${escapeMarkdown(state.address) || 'وسط المدينة'}\n` +
    `${separator}\n` +
    `💳 طريقة الدفع: الدفع عند الاستلام\n` +
    `${separator}\n` +
    `💰 المبلغ الإجمالي: ${escapeMarkdown(amountLabel)}\n` +
    `${separator}\n` +
    `📝 ملاحظات: ${escapeMarkdown(state.notes) || 'لا يوجد'}\n` +
    `${separator}\n` +
    statusLine +
    `\n🖼 الصور: (${photosCount} صور مرفقة)`
  );
}

/**
 * تنسق رسالة مراجعة الطلب (للاستخدام في المعالج)
 */
export function formatReviewMessage(state: OrderState): string {
  return formatOrderMessage(state, undefined, true);
}

/**
 * يقوم بإنشاء أزرار التحكم بالطلبية التي ستظهر في القناة حسب الحالة
 * @param orderId المعرف الفريد للطلبية
 * @param currentStatus حالة الطلب الحالية
 */
export function getChannelControlKeyboard(orderId: string, currentStatus: string = 'preparing'): InlineKeyboardMarkup {
  const buttons = [];
  
  // بناء الأزرار حسب الحالة الحالية
  if (currentStatus === 'preparing') {
    buttons.push([
      Markup.button.callback(L.statusPrepared, `status:prepared:${orderId}`),
      Markup.button.callback(L.statusShipped, `status:shipped:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'prepared') {
    buttons.push([
      Markup.button.callback('❌ إلغاء التجهيز', `cancel_status:prepared:${orderId}`),
      Markup.button.callback(L.statusShipped, `status:shipped:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'shipped') {
    buttons.push([
      Markup.button.callback('❌ إلغاء الإرسال', `cancel_status:shipped:${orderId}`),
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'delivered') {
    buttons.push([
      Markup.button.callback('❌ إلغاء التسليم', `cancel_status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'canceled') {
    buttons.push([
      Markup.button.callback('🔄 إعادة تفعيل', `status:preparing:${orderId}`),
    ]);
  }
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * يحول حالة الطلب إلى نص عربي مع الرموز التعبيرية
 */
export function getStatusDisplayText(status: string): string {
  switch (status) {
    case 'preparing': return '🔍 قيد التجهيز';
    case 'prepared': return '✅ تم التجهيز';
    case 'shipped': return '🚚 تم الإرسال';
    case 'delivered': return '📦 تم التسليم';
    case 'canceled': return '❌ تم الإلغاء';
    default: return '❓ غير معروف';
  }
}

/**
 * تنسيق تقرير إحصائيات البلد مع العمولات ونظام الائتمان
 */
export function formatWilayaStatisticsReport(wilaya: string, stats: any, totalReceived: number = 0): string {
  const separator = '━━━━━━━━━━━━━━━━━━━━━';
  
  // حساب مبالغ المحاسبة مع العمولات
  const shippedAmount = stats.byStatus.shipped.amount;
  const deliveredAmount = stats.byStatus.delivered.amount;
  const totalOrderAmount = shippedAmount + deliveredAmount;
  
  // حساب العمولات
  const commission = getDistributorCommission(wilaya);
  const totalOrdersForAccounting = stats.byStatus.shipped.count + stats.byStatus.delivered.count;
  const totalCommissions = commission * totalOrdersForAccounting;
  const totalCollectible = totalOrderAmount - totalCommissions;
  
  // استيراد دوال الائتمان من مل commission
  const remainingBalance = calculateRemainingBalance(totalCollectible, totalReceived);
  const hasCredit = hasCreditBalance(remainingBalance);
  const creditAmount = getCreditAmount(remainingBalance);
  
  // بناء قسم عرض الرصيد
  let balanceSection;
  if (hasCredit) {
    balanceSection = (
      `💰 المستلم فعلاً: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
      `🟢 **رصيد ائتمان: ${creditAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج**`
    );
  } else if (remainingBalance === 0) {
    balanceSection = (
      `💰 المستلم فعلاً: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
      `✅ **تم التحصيل بالكامل**`
    );
  } else {
    balanceSection = (
      `💰 المستلم فعلاً: ${totalReceived.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
      `⏳ **المتبقي: ${remainingBalance.toLocaleString('ar-DZ', { useGrouping: false })} د.ج**`
    );
  }
  
  return (
    `📊 *إحصائيات بلد: ${wilaya}*\n` +
    `${separator}\n` +
    `📦 إجمالي الطلبيات: *${stats.totalOrders}*\n` +
    `💰 إجمالي المبالغ: *${stats.totalAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج*\n` +
    `${separator}\n\n` +
    `📋 *حسب الحالة:*\n` +
    `🔍 قيد التجهيز: ${stats.byStatus.preparing.count} طلبيات (${stats.byStatus.preparing.amount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج)\n` +
    `✅ تم التجهيز: ${stats.byStatus.prepared.count} طلبيات (${stats.byStatus.prepared.amount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج)\n` +
    `🚚 تم الإرسال: ${stats.byStatus.shipped.count} طلبيات (${stats.byStatus.shipped.amount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج)\n` +
    `📦 تم التسليم: ${stats.byStatus.delivered.count} طلبيات (${stats.byStatus.delivered.amount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج)\n\n` +
    `${separator}\n` +
    `💼 *للمحاسبة مع الموزع:*\n` +
    `📦 إجمالي قيمة الطلبيات: ${totalOrderAmount.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
    `➖ عمولة الموزع (${commission} د.ج × ${totalOrdersForAccounting}): ${totalCommissions.toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n` +
    `💵 *المطلوب تحصيله: ${totalCollectible.toLocaleString('ar-DZ', { useGrouping: false })} د.ج*\n\n` +
    balanceSection
  );
}

/**
 * تنسيق قائمة طلبيات مفصلة
 */
export function formatOrdersList(orders: any[], title: string): string {
  if (orders.length === 0) {
    return `${title}\n\n⚠️ لا توجد طلبيات في هذه الفئة.`;
  }
  
  let message = `${title}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  orders.slice(0, 10).forEach((order, index) => { // عرض أول 10 طلبيات فقط
    const statusEmoji = getStatusEmoji(order.status);
    const date = new Date(order.createdAt).toLocaleDateString('ar-DZ');
    
    message += `${index + 1}. *${order.orderId}*\n`;
    message += `   👤 ${order.customerName || 'غير محدد'}\n`;
    message += `   💰 ${(order.amountTotal || 0).toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n`;
    message += `   ${statusEmoji} ${getStatusDisplayText(order.status)}\n`;
    message += `   📅 ${date}\n\n`;
  });
  
  if (orders.length > 10) {
    message += `… و${orders.length - 10} طلبيات أخرى`;
  }
  
  return message;
}

/**
 * الحصول على رمز الحالة
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'preparing': return '🔍';
    case 'prepared': return '✅';
    case 'shipped': return '🚚';
    case 'delivered': return '📦';
    case 'canceled': return '❌';
    default: return '❔';
  }
}

/**
 * لوحة مفاتيح إدارة المدفوعات
 */
export function getPaymentManagementKeyboard(wilaya: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 عرض قائمة المدفوعات', `payment:list:${wilaya}`)],
    [Markup.button.callback('💰 إضافة دفعة جديدة', `payment:receive:${wilaya}`)],
    [Markup.button.callback('⬅️ عودة', `stats:wilaya:${wilaya}`)]
  ]);
}

/**
 * لوحة مفاتيح تعديل دفعة معينة
 */
export function getPaymentEditKeyboard(paymentId: string, wilaya: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ تعديل المبلغ', `payment:edit:${paymentId}`)],
    [Markup.button.callback('🗑️ حذف الدفعة', `payment:delete:${paymentId}`)],
    [Markup.button.callback('⬅️ عودة', `payment:manage:${wilaya}`)]
  ]);
}

/**
 * تنسيق قائمة المدفوعات مع أزرار التعديل
 */
export function formatPaymentsList(payments: any[], wilaya: string): { message: string; keyboard: InlineKeyboardMarkup } {
  if (payments.length === 0) {
    return {
      message: `📊 *قائمة مدفوعات ${wilaya}*\n\n⚠️ لا توجد مدفوعات مسجلة بعد.`,
      keyboard: getPaymentManagementKeyboard(wilaya)
    };
  }

  let message = `📊 *قائمة مدفوعات ${wilaya}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  const buttons: any[][] = [];
  
  payments.slice(0, 8).forEach((payment, index) => {
    const date = payment.createdAt ? new Date(payment.createdAt as string).toLocaleDateString('ar-DZ') : 'غير محدد';
    message += `${index + 1}. 💰 ${(payment.amount || 0).toLocaleString('ar-DZ', { useGrouping: false })} د.ج\n`;
    message += `   📅 ${date}\n`;
    if (payment.notes && payment.notes !== 'تم التسجيل عبر البوت') {
      message += `   📝 ${payment.notes}\n`;
    }
    message += `\n`;
    
    // إضافة زر لكل دفعة
    buttons.push([Markup.button.callback(`✏️ تعديل #${index + 1}`, `payment:select:${payment.paymentId}`)]);
  });
  
  if (payments.length > 8) {
    message += `... و${payments.length - 8} عمليات أخرى\n`;
  }
  
  // إضافة أزرار التحكم
  buttons.push([Markup.button.callback('⬅️ عودة', `stats:wilaya:${wilaya}`)]);
  
  return {
    message,
    keyboard: Markup.inlineKeyboard(buttons)
  };
}
