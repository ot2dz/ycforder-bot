/**
 * نظام عمولات الموزعين وإدارة المدفوعات
 * Distributor commission system and payment management
 */

// عمولات الموزعين بالدينار الجزائري لكل طلبية
export const DISTRIBUTOR_COMMISSIONS: Record<string, number> = {
  'تمنراست': 300,
  'أدرار': 300, 
  'رقان': 200,
  'أولف': 200,
  'عين صالح': 100,
};

/**
 * حساب عمولة الموزع حسب البلد
 * @param wilaya اسم البلد/الولاية
 * @returns مبلغ العمولة بالدينار الجزائري
 */
export function getDistributorCommission(wilaya: string): number {
  return DISTRIBUTOR_COMMISSIONS[wilaya] || 0;
}

/**
 * حساب المبلغ المطلوب تحصيله بعد خصم العمولة
 * @param totalAmount المبلغ الإجمالي للطلبية
 * @param wilaya اسم البلد/الولاية
 * @returns المبلغ المطلوب تحصيله بعد خصم العمولة
 */
export function calculateCollectibleAmount(totalAmount: number, wilaya: string): number {
  const commission = getDistributorCommission(wilaya);
  return Math.max(0, totalAmount - commission);
}

/**
 * حساب إجمالي المبالغ المطلوب تحصيلها من طلبات متعددة
 * @param orders قائمة الطلبات المرسلة والمسلمة
 * @returns إجمالي المبلغ المطلوب تحصيله
 */
export function calculateTotalCollectibleAmount(orders: Array<{ stateCommune: string; amountTotal: number }>): number {
  return orders.reduce((total, order) => {
    return total + calculateCollectibleAmount(order.amountTotal, order.stateCommune);
  }, 0);
}

/**
 * حساب إجمالي العمولات من طلبات متعددة
 * @param orders قائمة الطلبات
 * @returns إجمالي مبلغ العمولات
 */
export function calculateTotalCommissions(orders: Array<{ stateCommune: string; amountTotal: number }>): number {
  return orders.reduce((total, order) => {
    return total + getDistributorCommission(order.stateCommune);
  }, 0);
}

/**
 * حساب المبلغ المتبقي بعد استلام دفعة من الموزع
 * يدعم النظام رصيد الائتمان (المبالغ السالبة) للدفعات الزائدة
 * @param totalCollectible إجمالي المبلغ المطلوب تحصيله
 * @param receivedAmount المبلغ المستلم من الموزع
 * @returns المبلغ المتبقي (يمكن أن يكون سالباً للائتمان)
 */
export function calculateRemainingBalance(totalCollectible: number, receivedAmount: number): number {
  // إرجاع الفرق الحقيقي بدون تطبيق Math.max
  // المبالغ السالبة تمثل رصيد ائتمان للموزع
  return totalCollectible - receivedAmount;
}

/**
 * تحديد ما إذا كان لدى الموزع رصيد ائتمان
 * @param remainingBalance المبلغ المتبقي
 * @returns true إذا كان هناك رصيد ائتمان (مبلغ سالب)
 */
export function hasCreditBalance(remainingBalance: number): boolean {
  return remainingBalance < 0;
}

/**
 * الحصول على مبلغ الائتمان (القيمة المطلقة للمبلغ السالب)
 * @param remainingBalance المبلغ المتبقي
 * @returns مبلغ الائتمان أو 0 إذا لم يكن هناك ائتمان
 */
export function getCreditAmount(remainingBalance: number): number {
  return remainingBalance < 0 ? Math.abs(remainingBalance) : 0;
}