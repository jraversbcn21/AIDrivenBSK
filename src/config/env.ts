import { z } from 'zod';
import { environments, type EnvName, type EnvironmentDefaults } from './environments';

const schema = z.object({
  ENVIRONMENT: z.enum(['prod', 'des', 'local'], {
    errorMap: () => ({ message: 'ENVIRONMENT must be one of: prod | des | local' }),
  }),
  BASE_URL: z.string({ required_error: 'BASE_URL is required' }).url('BASE_URL must be a valid URL'),
});

export interface AppEnv extends EnvironmentDefaults {
  name: EnvName;
  baseURL: string;
}

export function loadEnv(): AppEnv {
  const parsed = schema.safeParse({
    ENVIRONMENT: process.env.ENVIRONMENT,
    BASE_URL: process.env.BASE_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.errors.map((e) => `- ${e.message}`).join('\n')}`);
  }
  const name = parsed.data.ENVIRONMENT;
  return { name, baseURL: parsed.data.BASE_URL, ...environments[name] };
}
