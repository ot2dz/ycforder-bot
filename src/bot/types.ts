export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

export interface OrderState {
  step:
    | 'awaiting_photos'
    | 'awaiting_customer_name'
    | 'awaiting_phone'
    | 'awaiting_state_commune'
    | 'awaiting_address'
    | 'awaiting_amount_total'
    | 'awaiting_notes'
    | 'reviewing'
    | 'submitting'
    | 'awaiting_payment_amount' // حالة جديدة لتسجيل المدفوعات
    | 'awaiting_payment_edit'; // حالة جديدة لتعديل المدفوعات

  telegramFileIds: string[];
  customerName?: string;
  phone?: string;
  stateCommune?: string;
  address?: string;
  paymentMethod: 'COD';
  amountTotal?: number;
  notes?: string;
  lastMessageId?: number;
  reviewMediaMessageIds?: number[];
  isEditing?: boolean; // حقل جديد لتتبع حالة التعديل
  cloudinaryPhotoData?: CloudinaryUploadResult[]; // لتخزين نتائج الرفع
  wilayaForPayment?: string; // لحفظ اسم الولاية عند تسجيل مدفوعات
  paymentIdForEdit?: string; // لحفظ معرف الدفعة عند التعديل
}

export const userStates = new Map<number, OrderState>();
