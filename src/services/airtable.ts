import 'dotenv/config';
import Airtable, { FieldSet, Record } from 'airtable';
import { logger } from '../lib/logger.ts';
import type { OrderState } from '../bot/types.ts';

// --- تهيئة Airtable ---
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
  throw new Error('Airtable configuration is missing in .env file.');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base(AIRTABLE_TABLE_NAME);

logger.info('Airtable service configured.');

/**
 * يولد معرف طلب جديد بالتسلسل اليومي
 * @returns معرف الطلب بصيغة YCF-YYYY-MM-DD-XXX
 */
export async function generateOrderId(): Promise<string> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const prefix = `YCF-${today}`;
    
    try {
        // جلب جميع الطلبات لهذا اليوم
        const records = await table.select({
            filterByFormula: `FIND("${prefix}", {order_id}) = 1`,
            fields: ['order_id'],
            sort: [{ field: 'created_at', direction: 'desc' }]
        }).all();
        
        // العثور على أعلى رقم تسلسلي لهذا اليوم
        let maxNumber = 0;
        records.forEach(record => {
            const orderId = record.get('order_id') as string;
            const match = orderId.match(/YCF-\d{4}-\d{2}-\d{2}-(\d{3})$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) {
                    maxNumber = num;
                }
            }
        });
        
        // الرقم التالي
        const nextNumber = maxNumber + 1;
        const paddedNumber = nextNumber.toString().padStart(3, '0');
        
        const newOrderId = `${prefix}-${paddedNumber}`;
        logger.info({ newOrderId, todaysOrderCount: nextNumber }, 'Generated new order ID');
        
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
        const records = await table.select({
            // فرز حسب تاريخ الإنشاء (الأحدث أولاً)
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