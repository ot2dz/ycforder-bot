import { logger } from '../lib/logger.ts';

let authorizedIds: Set<string>;

function getAuthorizedIds(): Set<string> {
    if (authorizedIds) {
        return authorizedIds;
    }

    const idsFromEnv = process.env.AUTHORIZED_USER_IDS;
    if (!idsFromEnv) {
        logger.warn('AUTHORIZED_USER_IDS is not set in .env. No user will be authorized.');
        authorizedIds = new Set();
        return authorizedIds;
    }

    const idArray = idsFromEnv.split(',').map(id => id.trim());
    authorizedIds = new Set(idArray);
    logger.info({ authorized_count: authorizedIds.size }, 'Authorized user IDs loaded.');
    return authorizedIds;
}

/**
 * يتحقق مما إذا كان معرف المستخدم موجوداً في قائمة المصرح لهم.
 * @param userId معرف مستخدم تيليجرام
 * @returns true إذا كان المستخدم مصرحاً له.
 */
export function isUserAuthorized(userId: number): boolean {
    const ids = getAuthorizedIds();
    return ids.has(String(userId));
}