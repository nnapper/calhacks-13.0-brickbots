import {defineSchema,defineTable} from 'convex/server';
import {v} from 'convex/values';
export default defineSchema({
 workspaces:defineTable({tokenHash:v.string(),snapshot:v.optional(v.any()),revision:v.number(),updatedAt:v.number()}).index('by_token',['tokenHash']),
 files:defineTable({workspaceId:v.id('workspaces'),storageId:v.id('_storage')}).index('by_storage',['storageId']),
 analyses:defineTable({workspaceId:v.id('workspaces'),revision:v.string(),status:v.string(),result:v.optional(v.any()),error:v.optional(v.string()),model:v.optional(v.string()),createdAt:v.number()}).index('by_workspace',['workspaceId']),
});
