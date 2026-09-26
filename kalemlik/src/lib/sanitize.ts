// Kayıtları sunucuya göndermeden önce doğrulama kurallarına uydurur. Asıl kod shared/repair.mjs içindedir;
// sunucu da her kaydı doğrulamadan önce aynı onarımdan geçirir (iki taraf birebir aynı kuralları uygular).
import {repairPageContent, repairRecord} from '@shared/repair.mjs';
import type {EntityName, PageContent} from './types';

export const sanitizePageContent = (c: PageContent): PageContent => repairPageContent(c) as PageContent;

/** Gönderilecek kaydın verisini (id/rev/zaman damgaları hariç) sunucu kurallarına uydurur. */
export const sanitizeRecord = (entity: EntityName, data: Record<string, unknown>): Record<string, unknown> => repairRecord(entity, data);
