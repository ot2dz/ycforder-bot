import 'dotenv/config';
import Airtable, { FieldSet, Record } from 'airtable';
import { logger } from '../lib/logger.js';
import type { OrderState } from '../bot/types.js';

// --- تهيئة Airtable ---
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
  throw new Error('Airtable configuration is missing in .env file.');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base(AIRTABLE_TABLE_NAME);

logger.info('Airtable service configured.');

/**
 * يولد معرف طلب جديد بالتسلسل المستمر
 * @returns معرف الطلب بصيغة YCF-YYYY-MM-DD-XXX
 */
export async function generateOrderId(): Promise<string> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const prefix = `YCF-${today}`;
    
    try {
        // جلب جميع الطلبات التي تبدأ بـ YCF-
        const records = await table.select({
            filterByFormula: `FIND("YCF-", {order_id}) = 1`,
            fields: ['order_id'],
            sort: [{ field: 'created_at', direction: 'desc' }]
        }).all();
        
        // العثور على أعلى رقم تسلسلي من جميع الطلبات
        let maxNumber = 0;
        records.forEach(record => {
            const orderId = record.get('order_id') as string;
            // البحث عن أي طلب بصيغة YCF-YYYY-MM-DD-XXX
            const match = orderId.match(/YCF-\d{4}-\d{2}-\d{2}-(\d{3})$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) {
                    maxNumber = num;
                }
            }
        });
        
        // الرقم التالي (تسلسل مستمر)
        const nextNumber = maxNumber + 1;
        const paddedNumber = nextNumber.toString().padStart(3, '0');
        
        const newOrderId = `${prefix}-${paddedNumber}`;
        logger.info({ newOrderId, totalOrderCount: nextNumber, maxNumber }, 'Generated new order ID with continuous sequence');
        
        return newOrderId;
    } catch (error) {
        logger.error({ error }, 'Failed to generate order ID, falling back to timestamp');
        // في حالة الخطأ، نستخدم الطريقة القديمة
        return `YCF-${today}-${String(Date.now()).slice(-3)}`;
    }
}
export async function saveOrderToAirtable(state: OrderState, orderId: string) {
  logger.info({ orderId }, 'Saving order to Airtable...');

  const cloudinaryUrls = state.cloudinaryPhotoData?.map(p => p.secure_url).join('\n') || '';

  const recordData: FieldSet = {
    order_id: orderId,
    // created_at يتم إنشاؤه تلقائياً بواسطة Airtable
    status: 'preparing',
    customer_name: state.customerName,
    phone: state.phone,
    state_commune: state.stateCommune,
    address: state.address,
    amount_total: state.amountTotal,
    notes: state.notes,
    photo_links: cloudinaryUrls,
  };

  try {
    await table.create([{ fields: recordData }]);
    logger.info({ orderId }, 'Successfully saved order to Airtable.');
  } catch (error) {
    logger.error({ error, orderId }, 'Failed to save order to Airtable.');
    throw error;
  }
}

/**
 * يجلب كل الطلبات من Airtable.
 */
export async function fetchAllOrders() {
    logger.info('Fetching all orders from Airtable...');
    try {
        // جلب الطلبات فقط (استبعاد سجلات المدفوعات)
        const records = await table.select({
            filterByFormula: `{status} != "payment_received"`,
            sort: [{ field: 'created_at', direction: 'desc' }],
            // جلب الحقول المطلوبة فقط للملخص
            fields: ['order_id', 'customer_name', 'state_commune', 'amount_total'],
        }).all();

        return records.map(record => ({
            orderId: record.get('order_id'),
            customerName: record.get('customer_name'),
            stateCommune: record.get('state_commune'),
            amountTotal: record.get('amount_total'),
        }));
    } catch (error) {
        logger.error({ error }, 'Failed to fetch all orders from Airtable.');
        throw error;
    }
}

/**
 * يحدث حالة طلب معين في Airtable
 * @param orderId معرف الطلب
 * @param newStatus الحالة الجديدة
 */
export async function updateOrderStatus(orderId: string, newStatus: string) {
    logger.info({ orderId, newStatus }, 'Updating order status in Airtable...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            throw new Error(`Order with ID ${orderId} not found`);
        }
        
        const record = records[0];
        await table.update(record.getId(), {
            status: newStatus
        });
        
        logger.info({ orderId, newStatus }, 'Successfully updated order status in Airtable.');
    } catch (error) {
        logger.error({ error, orderId, newStatus }, 'Failed to update order status in Airtable.');
        throw error;
    }
}

/**
 * يحذف طلب نهائياً من Airtable
 * @param orderId معرف الطلب
 */
export async function deleteOrder(orderId: string) {
    logger.info({ orderId }, 'Deleting order permanently from Airtable...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            throw new Error(`Order with ID ${orderId} not found`);
        }
        
        const record = records[0];
        await table.destroy([record.getId()]);
        
        logger.info({ orderId }, 'Successfully deleted order from Airtable.');
    } catch (error) {
        logger.error({ error, orderId }, 'Failed to delete order from Airtable.');
        throw error;
    }
}

/**
 * يجلب حالة طلب معين من Airtable
 * @param orderId معرف الطلب
 * @returns حالة الطلب أو null إذا لم يتم العثور عليه
 */
export async function getOrderStatus(orderId: string): Promise<string | null> {
    logger.info({ orderId }, 'Fetching order status from Airtable...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            fields: ['status'],
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            return null;
        }
        
        const status = records[0].get('status') as string || 'preparing';
        logger.info({ orderId, status }, 'Successfully fetched order status from Airtable.');
        return status;
    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order status from Airtable.');
        throw error;
    }
}
export async function fetchOrderById(orderId: string) {
    logger.info({ orderId }, 'Fetching order details from Airtable...');
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            return null;
        }
        
        const record = records[0];
        const photoLinks = (record.get('photo_links') as string || '').split('\n').filter(Boolean);

        return {
            customerName: record.get('customer_name'),
            phone: record.get('phone'),
            stateCommune: record.get('state_commune'),
            address: record.get('address'),
            paymentMethod: 'COD', // ثابت
            amountTotal: record.get('amount_total'),
            notes: record.get('notes'),
            cloudinaryPhotoData: photoLinks.map(url => ({ secure_url: url })),
            telegramFileIds: photoLinks, // لحساب العدد فقط
        } as Partial<OrderState>;

    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order by ID from Airtable.');
        throw error;
    }
}

/**
 * يجلب الطلبات حسب الولاية
 * @param wilaya اسم الولاية
 */
export async function getOrdersByWilaya(wilaya: string) {
    logger.info({ wilaya }, 'Fetching orders by wilaya from Airtable...');
    try {
        // جلب الطلبات فقط (استبعاد سجلات المدفوعات)
        const records = await table.select({
            filterByFormula: `AND({state_commune} = "${wilaya}", {status} != "payment_received")`,
            sort: [{ field: 'created_at', direction: 'desc' }],
        }).all();

        return records.map(record => ({
            orderId: record.get('order_id'),
            customerName: record.get('customer_name'),
            phone: record.get('phone'),
            stateCommune: record.get('state_commune'),
            address: record.get('address'),
            amountTotal: record.get('amount_total'),
            status: record.get('status') || 'preparing',
            createdAt: record.get('created_at'),
            notes: record.get('notes'),
        }));
    } catch (error) {
        logger.error({ error, wilaya }, 'Failed to fetch orders by wilaya from Airtable.');
        throw error;
    }
}

/**
 * يجلب إحصائيات الطلبات حسب الولاية
 * @param wilaya اسم الولاية
 */
export async function getOrderStatisticsByWilaya(wilaya: string) {
    logger.info({ wilaya }, 'Fetching order statistics by wilaya from Airtable...');
    try {
        // جلب الطلبات فقط (استبعاد سجلات المدفوعات)
        const records = await table.select({
            filterByFormula: `AND({state_commune} = "${wilaya}", {status} != "payment_received")`,
            fields: ['order_id', 'status', 'amount_total', 'created_at'],
        }).all();

        // تجميع الإحصائيات
        const stats = {
            totalOrders: records.length,
            totalAmount: 0,
            byStatus: {
                preparing: { count: 0, amount: 0 },
                prepared: { count: 0, amount: 0 },
                shipped: { count: 0, amount: 0 },
                delivered: { count: 0, amount: 0 },
                canceled: { count: 0, amount: 0 }
            }
        };

        records.forEach(record => {
            const status = (record.get('status') as string) || 'preparing';
            const amount = (record.get('amount_total') as number) || 0;
            
            stats.totalAmount += amount;
            if (stats.byStatus[status as keyof typeof stats.byStatus]) {
                stats.byStatus[status as keyof typeof stats.byStatus].count++;
                stats.byStatus[status as keyof typeof stats.byStatus].amount += amount;
            }
        });

        return stats;
    } catch (error) {
        logger.error({ error, wilaya }, 'Failed to fetch order statistics by wilaya from Airtable.');
        throw error;
    }
}

/**
 * يجلب الطلبات حسب الولاية والحالة
 * @param wilaya اسم الولاية
 * @param status حالة الطلب
 */
export async function getOrdersByWilayaAndStatus(wilaya: string, status: string) {
    logger.info({ wilaya, status }, 'Fetching orders by wilaya and status from Airtable...');
    try {
        // جلب الطلبات فقط (استبعاد سجلات المدفوعات)
        const records = await table.select({
            filterByFormula: `AND({state_commune} = "${wilaya}", {status} = "${status}", {status} != "payment_received")`,
            sort: [{ field: 'created_at', direction: 'desc' }],
        }).all();

        return records.map(record => ({
            orderId: record.get('order_id'),
            customerName: record.get('customer_name'),
            amountTotal: record.get('amount_total'),
            status: record.get('status') || 'preparing',
            createdAt: record.get('created_at'),
        }));
    } catch (error) {
        logger.error({ error, wilaya, status }, 'Failed to fetch orders by wilaya and status from Airtable.');
        throw error;
    }
}

/**
 * حفظ عملية استلام مبلغ من موزع - يتم حفظها في جدول الطلبات الرئيسي
 * @param wilaya اسم الولاية
 * @param receivedAmount المبلغ المستلم
 * @param notes ملاحظات إضافية
 */
export async function recordDistributorPayment(wilaya: string, receivedAmount: number, notes?: string) {
    logger.info({ wilaya, receivedAmount, notes }, 'Recording distributor payment...');
    
    try {
        // إنشاء سجل دفعة في جدول الطلبات الرئيسي مع معرف خاص
        const paymentOrderId = `PAYMENT-${wilaya}-${Date.now()}`;
        
        const paymentRecord = {
            order_id: paymentOrderId,
            customer_name: `دفعة من موزع ${wilaya}`,
            phone: 'PAYMENT_RECORD',
            state_commune: wilaya,
            address: 'تسجيل دفعة',
            amount_total: receivedAmount,
            status: 'payment_received',
            notes: notes || 'تم التسجيل عبر البوت',
            // created_at يتم إنشاؤه تلقائياً بواسطة Airtable
        };
        
        await table.create([{ fields: paymentRecord }]);
        logger.info({ wilaya, receivedAmount }, 'Successfully recorded distributor payment.');
        
        return paymentRecord;
    } catch (error) {
        logger.error({ error, wilaya, receivedAmount }, 'Failed to record distributor payment.');
        throw error;
    }
}

/**
 * جلب إجمالي المبالغ المستلمة من موزع بلد معين
 * @param wilaya اسم الولاية
 * @returns إجمالي المبالغ المستلمة
 */
export async function getTotalReceivedFromDistributor(wilaya: string): Promise<number> {
    logger.info({ wilaya }, 'Fetching total received payments from distributor...');
    
    try {
        // البحث عن سجلات الدفعات في جدول الطلبات الرئيسي
        const records = await table.select({
            filterByFormula: `AND({state_commune} = "${wilaya}", {status} = "payment_received")`,
            fields: ['amount_total']
        }).all();
        
        const totalReceived = records.reduce((sum, record) => {
            const amount = record.get('amount_total') as number || 0;
            return sum + amount;
        }, 0);
        
        logger.info({ wilaya, totalReceived }, 'Successfully calculated total received payments.');
        return totalReceived;
    } catch (error) {
        logger.error({ error, wilaya }, 'Failed to fetch total received payments.');
        // في حالة الخطأ، نعيد 0
        return 0;
    }
}

/**
 * جلب تاريخ المدفوعات لموزع معين
 * @param wilaya اسم الولاية
 * @returns قائمة بسجلات المدفوعات
 */
export async function getDistributorPaymentHistory(wilaya: string) {
    logger.info({ wilaya }, 'Fetching distributor payment history...');
    
    try {
        const records = await table.select({
            filterByFormula: `AND({state_commune} = "${wilaya}", {status} = "payment_received")`,
            fields: ['order_id', 'amount_total', 'notes', 'created_at'],
            sort: [{ field: 'created_at', direction: 'desc' }]
        }).all();
        
        return records.map(record => ({
            paymentId: record.get('order_id') as string,
            amount: record.get('amount_total') as number,
            notes: record.get('notes') as string,
            createdAt: record.get('created_at') as string
        }));
    } catch (error) {
        logger.error({ error, wilaya }, 'Failed to fetch payment history.');
        return [];
    }
}

/**
 * حذف سجل دفعة معين
 * @param paymentId معرف سجل الدفعة
 */
export async function deletePaymentRecord(paymentId: string) {
    logger.info({ paymentId }, 'Deleting payment record...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${paymentId}"`,
            maxRecords: 1
        }).firstPage();
        
        if (records.length === 0) {
            throw new Error(`Payment record with ID ${paymentId} not found`);
        }
        
        const record = records[0];
        await table.destroy([record.getId()]);
        
        logger.info({ paymentId }, 'Successfully deleted payment record.');
    } catch (error) {
        logger.error({ error, paymentId }, 'Failed to delete payment record.');
        throw error;
    }
}

/**
 * تعديل مبلغ دفعة معينة
 * @param paymentId معرف سجل الدفعة
 * @param newAmount المبلغ الجديد
 * @param notes ملاحظات إضافية
 */
export async function updatePaymentRecord(paymentId: string, newAmount: number, notes?: string) {
    logger.info({ paymentId, newAmount, notes }, 'Updating payment record...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${paymentId}"`,
            maxRecords: 1
        }).firstPage();
        
        if (records.length === 0) {
            throw new Error(`Payment record with ID ${paymentId} not found`);
        }
        
        const record = records[0];
        const updateFields: any = {
            amount_total: newAmount
        };
        
        if (notes) {
            updateFields.notes = notes;
        }
        
        await table.update(record.getId(), updateFields);
        
        logger.info({ paymentId, newAmount }, 'Successfully updated payment record.');
    } catch (error) {
        logger.error({ error, paymentId, newAmount }, 'Failed to update payment record.');
        throw error;
    }
}