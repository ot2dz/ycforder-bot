import { Markup } from 'telegraf';
import type { OrderState } from './types.ts';

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
    [Markup.button.text(L.myOrders), Markup.button.text(L.help)]
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
