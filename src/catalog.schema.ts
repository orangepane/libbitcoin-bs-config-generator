import { z } from 'zod';

export const TIERS = ['essential', 'service', 'advanced', 'table'] as const;
export const KINDS = ['boolean', 'integer', 'decimal', 'text', 'path', 'list', 'enum'] as const;

export type Tier = (typeof TIERS)[number];
export type Kind = (typeof KINDS)[number];

const configValue = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.string()),
]);

const enumValue = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const settingSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    help: z.string().min(1),
    valueHelp: z.record(z.string(), z.string()).optional(),
    tier: z.enum(TIERS),
    kind: z.enum(KINDS),
    default: configValue,
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
    example: z.string().optional(),
    values: z.array(enumValue).min(1).optional(),
    secret: z.boolean().optional(),
    networkScoped: z.boolean().optional(),
    fixedAtCreation: z.boolean().optional(),
    /** bs computes this count at startup from the expected entries and installed memory. */
    derived: z.boolean().optional(),
    emit: z.enum(['always', 'whenChanged']),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['default'], message: `${s.key}: ${message}` });

    switch (s.kind) {
      case 'boolean':
        if (typeof s.default !== 'boolean') return fail('boolean setting needs a boolean default');
        break;
      case 'integer':
        if (typeof s.default !== 'number' || !Number.isInteger(s.default)) {
          return fail('integer setting needs an integer default');
        }
        break;
      case 'decimal':
        if (typeof s.default !== 'number') return fail('decimal setting needs a number default');
        break;
      case 'text':
      case 'path':
        if (typeof s.default !== 'string') return fail(`${s.kind} setting needs a string default`);
        break;
      case 'list':
        if (!Array.isArray(s.default)) return fail('list setting needs an array default');
        break;
      case 'enum':
        if (typeof s.default !== 'string') return fail('enum setting needs a string default');
        if (!s.values) return fail('enum setting needs values');
        if (!s.values.some((v) => v.value === s.default)) {
          return fail('enum default is not one of the values');
        }
        if (s.valueHelp) {
          for (const value of s.values) {
            if (!(value.value in s.valueHelp)) {
              return fail(`enum value "${value.value}" has no valueHelp entry`);
            }
          }
        }
        break;
    }
    if (s.min !== undefined && typeof s.default === 'number' && s.default < s.min) {
      return fail('default is below min');
    }
    if (s.max !== undefined && typeof s.default === 'number' && s.default > s.max) {
      return fail('default is above max');
    }
  });

export const sectionSchema = z
  .object({
    key: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    tier: z.enum(TIERS),
    service: z.boolean().optional(),
    enableKey: z.string().optional(),
    fixedAtCreation: z.boolean().optional(),
    settings: z.record(z.string(), settingSchema),
  })
  .superRefine((section, ctx) => {
    if (section.service && !section.enableKey) {
      ctx.addIssue({ code: 'custom', message: `${section.key}: a service needs enableKey` });
    }
    for (const [key, setting] of Object.entries(section.settings)) {
      if (setting.key !== key) {
        ctx.addIssue({ code: 'custom', message: `${section.key}: setting key mismatch at ${key}` });
      }
    }
  });

export const catalogSchema = z
  .object({
    meta: z.object({
      project: z.string(),
      version: z.string(),
      referenceUrl: z.string().url(),
      snapshot: z.string(),
      defaultsScope: z.literal('network'),
      generatedBy: z.string(),
      seedSha256: z.string(),
      sectionCount: z.number(),
      settingCount: z.number(),
    }),
    sections: z.record(z.string(), sectionSchema),
  })
  .superRefine((catalog, ctx) => {
    const sectionCount = Object.keys(catalog.sections).length;
    if (catalog.meta.sectionCount !== sectionCount) {
      ctx.addIssue({ code: 'custom', message: 'meta.sectionCount does not match the sections' });
    }
    const settingCount = Object.values(catalog.sections)
      .reduce((total, section) => total + Object.keys(section.settings).length, 0);
    if (catalog.meta.settingCount !== settingCount) {
      ctx.addIssue({ code: 'custom', message: 'meta.settingCount does not match the settings' });
    }
  });

export type SettingDef = z.infer<typeof settingSchema>;
export type SectionDef = z.infer<typeof sectionSchema>;
export type Catalog = z.infer<typeof catalogSchema>;

export function validateCatalog (input: unknown): Catalog {
  return catalogSchema.parse(input);
}
