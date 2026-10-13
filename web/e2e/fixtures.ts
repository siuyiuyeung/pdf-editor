import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { makeEncryptedPdf, makePdf } from '../tests/helpers';

type Upload = { name: string; mimeType: string; buffer: Buffer };

export async function pdfUpload(name: string, pages: number, size?: [number, number]): Promise<Upload> {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await makePdf(pages, { size })) };
}

export async function encryptedUpload(name: string): Promise<Upload> {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await makeEncryptedPdf()) };
}

export function junkUpload(name: string): Upload {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from('definitely not a pdf') };
}

export async function readDownload(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

/** Our error card; Next's route announcer also has role=alert, so match by text. */
export function alertWith(page: Page, text: string) {
  return page.getByRole('alert').filter({ hasText: text });
}
