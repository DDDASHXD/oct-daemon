import fs from 'node:fs/promises';
import path from 'node:path';

export async function readAuthToken(file: string): Promise<string | undefined> {
  try {
    const token = await fs.readFile(file, 'utf8');
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function writeAuthToken(file: string, token: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${token}\n`, { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
